-- =============================================================================
-- X AutoHub — Avisar a los admins cuando falla un despliegue, aunque no tengan el panel abierto
-- =============================================================================
--
-- La barra de `/admin` (2.14.0, `build-status`) dice cómo terminó el último despliegue, pero solo
-- mientras alguien tiene el panel abierto. Si un build falla de madrugada, el sitio se queda con la
-- versión anterior y nadie se entera hasta que entra. Esta migración hace que la base pregunte, y que
-- los admins reciban un aviso push.
--
--   · `check_deploy_failures()` corre cada 10 minutos (pg_cron) y le pide a la Edge Function `send-push`
--     un aviso de tipo `deploy`, con el mismo mecanismo de la 0028 (`pg_net` y los tres secretos del Vault).
--   · `send-push` es quien mira Vercel: lee el último despliegue de producción y, solo si terminó en
--     error y no se avisó ya de él, manda el aviso a los dispositivos de los admins.
--   · `deploy_alerts` recuerda de qué despliegues ya se avisó, para no repetir el aviso cada 10 minutos.
--
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **La base no sabe nada de Vercel.** Solo hace de reloj: cada 10 minutos dice "mira si hay algo que
--   avisar". El estado del despliegue lo lee `send-push` con los mismos secretos de `build-status`
--   (`VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`); la base no los guarda.
-- · **Solo cuenta el último despliegue de producción.** Si falló pero ya hay uno posterior que salió bien,
--   no hay nada que avisar: el sitio está al día.
-- · **El texto no sale de aquí ni de quien llama.** El POST solo dice `{ kind: 'deploy' }`; el mensaje, los
--   destinatarios (los admins) y el enlace los pone `send-push`.
-- · **Un aviso por despliegue fallido.** `deploy_alerts` guarda el id de Vercel; `send-push` lo anota
--   *antes* de mandar, así que dos llamadas seguidas no duplican el aviso. Si nadie tiene el aviso activado,
--   igual queda anotado: no se reintenta.
-- · **Sin secretos no se avisa, y tampoco falla**, como en la 0028 y la 0031.
-- · La tabla se limpia sola: `check_deploy_failures()` borra lo de más de 90 días.
--
--
-- ORDEN DE DESPLIEGUE
-- -------------------
-- Cualquiera. Con la migración y la función vieja, `send-push` responde 400 a `deploy` y no pasa nada;
-- con la función nueva y sin migración, no hay quien la llame. Se despliega primero la función, por orden.
-- El frontend no cambia.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES: `if not exists`, `create or replace` y `cron.schedule` con nombre.
-- =============================================================================

create table if not exists public.deploy_alerts (
  -- El `uid` del despliegue en Vercel.
  deployment_id text primary key,
  created_at    timestamptz not null default now()
);

comment on table public.deploy_alerts is
  'Despliegues fallidos de los que ya se avisó a los admins (0032). Solo la escribe send-push, con la clave de servicio.';

-- Nadie del navegador la toca: sin políticas y sin permisos. `send-push` entra con `service_role`.
alter table public.deploy_alerts enable row level security;
revoke all on public.deploy_alerts from public;
revoke all on public.deploy_alerts from anon;
revoke all on public.deploy_alerts from authenticated;
grant select, insert, delete on public.deploy_alerts to service_role;


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
  -- Lo que ya no sirve se va: un despliegue de hace tres meses no se va a volver a avisar.
  delete from public.deploy_alerts where created_at < now() - interval '90 days';

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
    -- Un aviso que no sale no es un error: se reintenta en 10 minutos.
    raise warning 'check_deploy_failures: %', sqlerrm;
    return 'no se pudo preguntar por el despliegue';
  end;

  return 'preguntado';
end;
$$;

comment on function public.check_deploy_failures() is
  'Cron cada 10 minutos (0032): le pide a send-push que mire el último despliegue y avise a los admins si falló. Nunca falla.';

-- Solo el cron la invoca (las tres líneas).
revoke all on function public.check_deploy_failures() from public;
revoke execute on function public.check_deploy_failures() from anon;
revoke execute on function public.check_deploy_failures() from authenticated;

select cron.schedule('check-deploy-failures', '*/10 * * * *', 'select public.check_deploy_failures()');
