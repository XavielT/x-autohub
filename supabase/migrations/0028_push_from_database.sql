-- =============================================================================
-- X AutoHub — Los avisos push salen de la base (después de la republicación)
-- =============================================================================
--
-- Hasta ahora el aviso al cliente ("Tu pedido salió") lo pedía el **panel**: justo después
-- de `set_order_status()` o `set_appointment_status()` llamaba a la Edge Function
-- `send-push`. Un cambio de estado hecho por otro camino (el editor de SQL, una función
-- futura, un webhook de pago) no avisaba a nadie.
--
-- Ahora lo pide la base, con un trigger. `pg_net` hace el POST a `send-push` cuando la
-- transacción se confirma, así que un cambio que se revierte no avisa.
--
--   · `notify_status_change()`: el trigger. Lo dispara un cambio de `status` en `orders`
--     y en `service_appointments`.
--
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **El aviso nunca rompe el cambio de estado.** Todo el envío va dentro de un bloque con
--   `exception when others`: si falta algún secreto, si `pg_net` no está o si la URL es
--   mala, el estado cambia igual y queda un `warning` en el log. Sin los secretos el
--   trigger simplemente no hace nada (como `fire_site_rebuild()` sin su enlace).
-- · **`send-push` ya no puede pedirle el admin a quien llama.** El trigger no tiene una
--   sesión de admin, así que la función acepta ahora una segunda credencial: la cabecera
--   `x-push-secret`, igual al secreto `PUSH_WEBHOOK_SECRET` de la función. Sigue aceptando
--   a un admin con su sesión. Nadie dice qué se avisa: el trigger manda solo `{ kind, id }`
--   y el texto sale de la base.
-- · **Tres secretos en Supabase Vault**, no en el repositorio ni en una tabla:
--       send_push_url         la URL de la función (https://<ref>.supabase.co/functions/v1/send-push)
--       send_push_anon_key    la clave pública `anon` (el gateway exige un JWT; esta no es secreta)
--       send_push_secret      el mismo valor que `PUSH_WEBHOOK_SECRET` en los secretos de la función
-- · **Los invitados no.** Un pedido o una cita sin dueño no tiene a quién avisar: el
--   trigger ni hace la llamada.
-- · **Quien cambia lo suyo no se avisa a sí mismo.** Si `auth.uid()` es el dueño (un cliente
--   que cancela su propia cita con `cancel_appointment()`), no hay aviso.
-- · **Solo cuando el estado cambia** (`old.status is distinct from new.status`): guardar
--   una nota o el comprobante no avisa. Qué estados dicen algo lo decide `send-push`
--   (los demás responden `no-message`).
--
--
-- ORDEN DE DESPLIEGUE
-- -------------------
-- Migración → función `send-push` nueva (con `PUSH_WEBHOOK_SECRET`) → secretos del Vault →
-- frontend. El frontend nuevo **deja de llamar** a `send-push` desde el panel: si se
-- desplegara antes que lo demás, no avisaría nadie. El anterior, con esta migración puesta,
-- avisaría **dos veces** (el panel y el trigger) una vez cargados los secretos.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES: `create or replace` / `drop ... if exists`.
-- =============================================================================

create or replace function public.notify_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_anon   text;
  v_secret text;
begin
  -- Sin dueño no hay a quién avisar, y quien cambia lo suyo ya lo sabe.
  if new.user_id is null or new.user_id = auth.uid() then
    return null;
  end if;

  begin
    select max(decrypted_secret) filter (where name = 'send_push_url'),
           max(decrypted_secret) filter (where name = 'send_push_anon_key'),
           max(decrypted_secret) filter (where name = 'send_push_secret')
      into v_url, v_anon, v_secret
      from vault.decrypted_secrets
     where name in ('send_push_url', 'send_push_anon_key', 'send_push_secret');

    -- Sin los tres no se avisa, y tampoco falla nada.
    if coalesce(v_url, '') = '' or coalesce(v_anon, '') = '' or coalesce(v_secret, '') = '' then
      return null;
    end if;

    perform net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
                   'kind', case tg_table_name when 'orders' then 'order' else 'appointment' end,
                   'id',   new.id
                 ),
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_anon,
                   'x-push-secret', v_secret
                 )
    );
  exception when others then
    -- Un aviso que no sale no es motivo para que el cambio de estado falle.
    raise warning 'notify_status_change: %', sqlerrm;
  end;

  return null;
end;
$$;

comment on function public.notify_status_change() is
  'Trigger: cuando cambia el estado de un pedido o de una cita con dueño, le pide a la Edge Function send-push que avise (pg_net, con los secretos del Vault). Nunca hace fallar el cambio.';

-- Una función de trigger no se invoca por rpc, pero se cierra igual (las tres líneas).
revoke all on function public.notify_status_change() from public;
revoke execute on function public.notify_status_change() from anon;
revoke execute on function public.notify_status_change() from authenticated;

drop trigger if exists orders_notify_status on public.orders;
create trigger orders_notify_status
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_status_change();

drop trigger if exists service_appointments_notify_status on public.service_appointments;
create trigger service_appointments_notify_status
  after update of status on public.service_appointments
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_status_change();
