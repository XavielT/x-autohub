-- =============================================================================
-- X AutoHub — Endurecer los avisos push (revisión de las versiones 2.15 a 2.23)
-- =============================================================================
--
-- Una revisión del código de las últimas versiones encontró tres cosas que se arreglan en la base:
--
--   1. **Cualquiera podía hacer que `send-push` llamara a cualquier URL `https://`.** `register_order_push()` y
--      `register_appointment_push()` (0034, 0035) las puede llamar `anon`, y solo comprobaban que el `endpoint` empezara por
--      `https://`. Con el uuid de un pedido o de una cita de invitado (que es solo suyo), alguien podía registrar
--      `https://servidor-ajeno/…` y, en el siguiente aviso, la Edge Function haría un POST a ese servidor con un JWT VAPID firmado:
--      un SSRF a ciegas y una fuga de ese JWT. `register_push_subscription()` (0024) tenía lo mismo para cualquier usuario con
--      cuenta. Ahora el `endpoint` tiene que ser de un servicio de push conocido (`is_push_endpoint()`).
--   2. **Se podía renovar o "des-vender" una publicación rechazada o pendiente.** `mark_publication_sold()` y
--      `renew_publication()` (0030) no miraban el estado. No la publicaba (el estado no se toca), pero dejaba al dueño mover las
--      fechas de algo que moderación tiene dado de baja. Ahora solo sirven para una publicación aprobada.
--   3. **`check_deploy_failures()` (0032) borraba los avisos de más de 90 días**, y esa tabla también es la que impide repetir
--      el aviso de un despliegue fallido que sigue siendo el último. Un fallo viejo y sin nuevos despliegues volvía a avisar cada
--      90 días. Se quita la limpieza: la tabla crece una fila por despliegue fallido, que es nada.
--
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **Una lista de servicios, no una prohibición de lo peligroso.** Los endpoints de Web Push son de pocos dominios (Chrome y
--   Android: `fcm.googleapis.com`; Firefox: `*.push.services.mozilla.com`; Safari: `*.push.apple.com`; Edge: `*.notify.windows.com`).
--   Una lista corta es más fácil de acertar que intentar excluir direcciones internas. Se pegan a `googleapis.com` solo los dos
--   hosts de push, no el dominio entero: en `storage.googleapis.com` cualquiera puede alojar contenido.
-- · **No es un `check` de la tabla.** Las filas que ya existen no se tocan (y un dominio nuevo de un navegador no debe romper
--   un `update` de otra columna). La barrera está donde entran los datos y, de nuevo, en `send-push` antes de llamar.
-- · **El host se exige seguido de `/` o `:443`**: `https://fcm.googleapis.com@otro.com/` no pasa.
-- · Los rechazos usan `22023`, el único código que la interfaz deja pasar con su mensaje en español.
--
--
-- ORDEN DE DESPLIEGUE
-- -------------------
-- Función `send-push` nueva (también valida el `endpoint` antes de llamar) → migración. El frontend no cambia. Con la migración y la
-- función vieja, los registros nuevos ya se validan en la base; la función solo dejaría de ser la segunda barrera.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES: todo es `create or replace`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ¿Es el endpoint de un servicio de push conocido?
-- -----------------------------------------------------------------------------
create or replace function public.is_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    p_endpoint ~* '^https://(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)(:443)?/',
    false
  );
$$;

comment on function public.is_push_endpoint(text) is
  'true si la URL es de un servicio de push conocido (FCM, Mozilla, Apple, Windows). Evita que send-push llame a cualquier servidor (0037).';

revoke all on function public.is_push_endpoint(text) from public;
grant execute on function public.is_push_endpoint(text) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. Las tres formas de registrar un dispositivo piden un endpoint conocido
-- -----------------------------------------------------------------------------
create or replace function public.register_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_devices constant integer := 10;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Inicia sesion para activar los avisos.' using errcode = '42501';
  end if;

  if not public.is_push_endpoint(p_endpoint) then
    raise exception 'Este navegador no usa un servicio de avisos compatible.' using errcode = '22023';
  end if;

  -- Un mismo dispositivo no puede estar a nombre de dos cuentas: la que entra se lo
  -- queda. (Si fuera de otra persona, esa dejó de recibir avisos aquí: es lo correcto.)
  delete from public.push_subscriptions s where s.endpoint = p_endpoint;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_user, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300));

  -- Un tope por cuenta: se conservan los más recientes.
  delete from public.push_subscriptions s
  where s.user_id = v_user
    and s.id not in (
      select id from public.push_subscriptions
      where user_id = v_user
      order by created_at desc, id desc
      limit c_max_devices
    );
end;
$$;

create or replace function public.register_order_push(
  p_order_id   uuid,
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_devices constant integer := 3;
  v_owner  uuid;
  v_status public.order_status;
begin
  select o.user_id, o.status into v_owner, v_status from public.orders o where o.id = p_order_id;

  if not found then
    raise exception 'Ese pedido no existe.' using errcode = '22023';
  end if;

  if v_owner is not null then
    raise exception 'Este pedido es de una cuenta: inicia sesion y activa los avisos desde tu perfil.' using errcode = '22023';
  end if;

  if v_status in ('delivered', 'cancelled') then
    raise exception 'Este pedido ya termino: no va a cambiar de estado.' using errcode = '22023';
  end if;

  if not public.is_push_endpoint(p_endpoint) then
    raise exception 'Este navegador no usa un servicio de avisos compatible.' using errcode = '22023';
  end if;

  -- El mismo dispositivo otra vez es una actualizacion, no un dispositivo mas.
  if not exists (
       select 1 from public.order_push_subscriptions s where s.order_id = p_order_id and s.endpoint = p_endpoint
     )
     and (select count(*) from public.order_push_subscriptions s where s.order_id = p_order_id) >= c_max_devices then
    raise exception 'Este pedido ya avisa a % dispositivos.', c_max_devices using errcode = '22023';
  end if;

  insert into public.order_push_subscriptions (order_id, endpoint, p256dh, auth, user_agent)
  values (p_order_id, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (order_id, endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;

create or replace function public.register_appointment_push(
  p_appointment_id uuid,
  p_endpoint       text,
  p_p256dh         text,
  p_auth           text,
  p_user_agent     text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_devices constant integer := 3;
  v_owner  uuid;
  v_status text;
begin
  select a.user_id, a.status into v_owner, v_status
    from public.service_appointments a where a.id = p_appointment_id;

  if not found then
    raise exception 'Esa cita no existe.' using errcode = '22023';
  end if;

  if v_owner is not null then
    raise exception 'Esta cita es de una cuenta: inicia sesion y activa los avisos desde tu perfil.' using errcode = '22023';
  end if;

  if v_status in ('done', 'cancelled', 'no_show') then
    raise exception 'Esta cita ya termino: no va a cambiar de estado.' using errcode = '22023';
  end if;

  if not public.is_push_endpoint(p_endpoint) then
    raise exception 'Este navegador no usa un servicio de avisos compatible.' using errcode = '22023';
  end if;

  -- El mismo dispositivo otra vez es una actualizacion, no un dispositivo mas.
  if not exists (
       select 1 from public.appointment_push_subscriptions s
        where s.appointment_id = p_appointment_id and s.endpoint = p_endpoint
     )
     and (select count(*) from public.appointment_push_subscriptions s where s.appointment_id = p_appointment_id) >= c_max_devices then
    raise exception 'Esta cita ya avisa a % dispositivos.', c_max_devices using errcode = '22023';
  end if;

  insert into public.appointment_push_subscriptions (appointment_id, endpoint, p256dh, auth, user_agent)
  values (p_appointment_id, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (appointment_id, endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. Vender y renovar solo sirven para una publicación aprobada
-- -----------------------------------------------------------------------------
create or replace function public.mark_publication_sold(p_id bigint)
returns table (sold_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner  uuid;
  v_status text;
begin
  select i.seller_id, i.status into v_owner, v_status from public.hub_market_items i where i.id = p_id;

  if not found then
    raise exception 'Esa publicacion no existe.' using errcode = '22023';
  end if;

  if auth.uid() is null or not (v_owner = auth.uid() or public.is_moderator_or_admin()) then
    raise exception 'Solo su dueno puede marcar una publicacion como vendida.' using errcode = '42501';
  end if;

  if v_status <> 'aprobado' then
    raise exception 'Solo una publicacion aprobada se puede marcar como vendida.' using errcode = '22023';
  end if;

  perform set_config('app.allow_moderation', 'on', true);

  update public.hub_market_items i
     set sold_at = coalesce(i.sold_at, now())
   where i.id = p_id;

  perform set_config('app.allow_moderation', 'off', true);

  return query
    select i.sold_at, i.expires_at from public.hub_market_items i where i.id = p_id;
end;
$$;

create or replace function public.renew_publication(p_id bigint)
returns table (sold_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner  uuid;
  v_status text;
begin
  select i.seller_id, i.status into v_owner, v_status from public.hub_market_items i where i.id = p_id;

  if not found then
    raise exception 'Esa publicacion no existe.' using errcode = '22023';
  end if;

  if auth.uid() is null or not (v_owner = auth.uid() or public.is_moderator_or_admin()) then
    raise exception 'Solo su dueno puede renovar una publicacion.' using errcode = '42501';
  end if;

  if v_status <> 'aprobado' then
    raise exception 'Solo una publicacion aprobada se puede renovar.' using errcode = '22023';
  end if;

  perform set_config('app.allow_moderation', 'on', true);

  update public.hub_market_items i
     set sold_at    = null,
         expires_at = now() + interval '60 days'
   where i.id = p_id;

  perform set_config('app.allow_moderation', 'off', true);

  return query
    select i.sold_at, i.expires_at from public.hub_market_items i where i.id = p_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. El aviso de un despliegue fallido no caduca
-- -----------------------------------------------------------------------------
-- La de la 0032 sin el `delete` de los avisos de más de 90 días.
create or replace function public.check_deploy_failures()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_anon   text;
  v_secret text;
begin
  select max(decrypted_secret) filter (where name = 'send_push_url'),
         max(decrypted_secret) filter (where name = 'send_push_anon_key'),
         max(decrypted_secret) filter (where name = 'send_push_secret')
    into v_url, v_anon, v_secret
    from vault.decrypted_secrets
   where name in ('send_push_url', 'send_push_anon_key', 'send_push_secret');

  if coalesce(v_url, '') = '' or coalesce(v_anon, '') = '' or coalesce(v_secret, '') = '' then
    return 'sin enlace de avisos: no se pregunto por el despliegue';
  end if;

  begin
    perform net.http_post(
      url     := v_url,
      body    := jsonb_build_object('kind', 'deploy'),
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_anon,
                   'x-push-secret', v_secret
                 )
    );
  exception when others then
    raise warning 'check_deploy_failures: %', sqlerrm;
    return 'no se pudo preguntar por el despliegue';
  end;

  return 'preguntado';
end;
$$;

comment on function public.check_deploy_failures() is
  'Cron cada 10 minutos (0032): le pide a send-push que mire el último despliegue y avise a los admins si falló. Nunca falla. Desde la 0037 no limpia deploy_alerts: esa tabla es lo que evita repetir el aviso de un fallo que sigue siendo el último.';
