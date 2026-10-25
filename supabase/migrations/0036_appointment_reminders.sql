-- =============================================================================
-- X AutoHub — Recordatorio push de una cita, el día antes
-- =============================================================================
--
-- Hasta aquí una cita solo avisaba cuando cambiaba de estado. Una cita confirmada para mañana no le recordaba nada a
-- nadie, y en un taller una cita a la que no se llega cuesta una hora de agenda. Esta migración manda un recordatorio push
-- cuando faltan menos de 24 horas.
--
--   · `send_appointment_reminders()` corre cada hora (pg_cron) y le pide a la Edge Function `send-push` un recordatorio
--     por cada cita confirmada que ocurre en las próximas 24 horas y todavía no lo recibió. Es el mismo mecanismo de la 0028
--     (`pg_net` y los tres secretos del Vault).
--   · `appointment_reminders` recuerda **para qué hora** ya se recordó. Si la cita se reprograma, la hora cambia y puede volver
--     a recordar; si no, no se repite cada hora.
--
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **Solo citas confirmadas.** Una `requested` todavía no está acordada; una en trabajo, hecha, cancelada o a la que no se
--   llegó ya no se recuerda.
-- · **Solo si hay a quién avisar.** Una cita de una cuenta con algún dispositivo, o una de invitado con dispositivos suscritos
--   (0035). Recordarle a nadie solo gastaría llamadas.
-- · **Ni en las últimas dos horas ni antes de las 24.** Una cita para dentro de una hora ya se la confirmaron ayer; una para
--   dentro de tres días todavía no toca. La ventana es (2 h, 24 h].
-- · **La tabla de lo ya recordado es aparte**, no una columna de `service_appointments`: escribir esa tabla a cada hora no
--   debe confundirse con un cambio de la cita.
-- · **El texto no sale de aquí.** La base solo dice `{ kind: 'appointment_reminder', id }`; `send-push` lee la cita, vuelve a
--   comprobar el estado y la ventana, y arma el mensaje.
-- · **Sin los secretos del Vault no se recuerda, y no se marca**: el día que se carguen, las citas que sigan dentro de la
--   ventana reciben su recordatorio. Si `pg_net` falla para una cita, esa queda sin marcar y se reintenta en la hora siguiente.
--
--
-- ORDEN DE DESPLIEGUE
-- -------------------
-- Función `send-push` nueva (acepta `appointment_reminder`) → migración. Con la migración y la función vieja, `send-push`
-- respondería 400 y cada cita quedaría marcada como recordada sin que nadie recibiera nada: la función va primero. El frontend
-- no cambia.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES: `if not exists`, `create or replace` y `cron.schedule` con nombre.
-- =============================================================================

create table if not exists public.appointment_reminders (
  appointment_id uuid primary key references public.service_appointments(id) on delete cascade,
  -- La hora de la cita para la que ya se recordó. Reprogramarla la cambia y habilita otro recordatorio.
  remind_for     timestamptz not null,
  created_at     timestamptz not null default now()
);

comment on table public.appointment_reminders is
  'Para qué hora de una cita ya se mandó el recordatorio (0036). Solo la lee y escribe send_appointment_reminders().';

-- Nadie del navegador la toca: sin políticas y sin permisos.
alter table public.appointment_reminders enable row level security;
revoke all on public.appointment_reminders from public;
revoke all on public.appointment_reminders from anon;
revoke all on public.appointment_reminders from authenticated;


create or replace function public.send_appointment_reminders()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_anon   text;
  v_secret text;
  v_item   record;
  v_count  integer := 0;
begin
  select max(decrypted_secret) filter (where name = 'send_push_url'),
         max(decrypted_secret) filter (where name = 'send_push_anon_key'),
         max(decrypted_secret) filter (where name = 'send_push_secret')
    into v_url, v_anon, v_secret
    from vault.decrypted_secrets
   where name in ('send_push_url', 'send_push_anon_key', 'send_push_secret');

  if coalesce(v_url, '') = '' or coalesce(v_anon, '') = '' or coalesce(v_secret, '') = '' then
    return 'sin enlace de avisos: no se recordo nada';
  end if;

  for v_item in
    select a.id, a.scheduled_at
      from public.service_appointments a
     where a.status = 'confirmed'
       and a.scheduled_at >  now() + interval '2 hours'
       and a.scheduled_at <= now() + interval '24 hours'
       and not exists (
         select 1 from public.appointment_reminders r
          where r.appointment_id = a.id and r.remind_for = a.scheduled_at
       )
       and (
         case
           when a.user_id is not null then exists (select 1 from public.push_subscriptions p where p.user_id = a.user_id)
           else exists (select 1 from public.appointment_push_subscriptions s where s.appointment_id = a.id)
         end
       )
     order by a.scheduled_at
  loop
    begin
      perform net.http_post(
        url     := v_url,
        body    := jsonb_build_object('kind', 'appointment_reminder', 'id', v_item.id),
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || v_anon,
                     'x-push-secret', v_secret
                   )
      );

      insert into public.appointment_reminders (appointment_id, remind_for)
      values (v_item.id, v_item.scheduled_at)
      on conflict (appointment_id) do update set remind_for = excluded.remind_for, created_at = now();

      v_count := v_count + 1;
    exception when others then
      raise warning 'send_appointment_reminders (cita %): %', v_item.id, sqlerrm;
    end;
  end loop;

  return v_count || ' recordatorios pedidos';
end;
$$;

comment on function public.send_appointment_reminders() is
  'Cron cada hora (0036): le pide a send-push un recordatorio por cada cita confirmada de las proximas 24 horas que todavia no lo recibio. Nunca falla por un aviso que no sale.';

-- Solo el cron la invoca (las tres líneas).
revoke all on function public.send_appointment_reminders() from public;
revoke execute on function public.send_appointment_reminders() from anon;
revoke execute on function public.send_appointment_reminders() from authenticated;

-- Al minuto 5 de cada hora.
select cron.schedule('appointment-reminders', '5 * * * *', 'select public.send_appointment_reminders()');
