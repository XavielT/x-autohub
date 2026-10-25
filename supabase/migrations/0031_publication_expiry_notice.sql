-- =============================================================================
-- X AutoHub — Avisar al dueño que su publicación de Hub Market está por vencer
-- =============================================================================
--
-- La 2.17.0 le dio plazo (60 días) a cada publicación de Hub Market, pero el dueño solo se entera
-- de que está por vencer si abre /perfil. Esta migración le manda un aviso push cuando le quedan
-- siete días, con el mismo mecanismo de la 0028: la base le pide a la Edge Function `send-push` que
-- avise, con `pg_net` y los tres secretos del Vault.
--
--   · `warn_expiring_publications()` corre una vez al día (pg_cron) y pide un aviso por cada
--     publicación que vence en los próximos siete días y todavía no avisó.
--   · `publication_expiry_notices` recuerda **para qué fecha de vencimiento** ya se avisó. Si el
--     dueño renueva, `expires_at` cambia y la publicación vuelve a poder avisar en su próximo
--     ciclo; si no, no se repite cada día.
--
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **Los avisos hechos viven en una tabla aparte**, no en una columna de `hub_market_items`: escribir
--   esa tabla cada vez que se avisa haría que `mark_site_dirty()` (0026, 0029) lo tomara por un cambio
--   del catálogo y lanzara un despliegue del sitio por cada aviso.
-- · **Una publicación sin vendedor, vendida, de prueba, no aprobada o sin activar no avisa.** Es lo
--   mismo que decide `mark_expired_publications()` (0030) sobre qué es visible.
-- · **Sin los secretos del Vault no se avisa, y no se marca como avisado**: el día que se carguen,
--   las que sigan dentro de la ventana de siete días avisan. Mientras tanto, nada falla.
-- · **Un aviso que no sale no es un error**: si `pg_net` falla para una publicación, se anota una
--   advertencia, esa publicación no queda marcada (lo reintenta mañana) y se sigue con las demás.
-- · **El texto no sale de aquí.** La base solo dice `{ kind: 'listing', id }`; `send-push` lee la
--   publicación y arma el mensaje, y vuelve a comprobar que esté por vencer.
--
--
-- ORDEN DE DESPLIEGUE
-- -------------------
-- Función `send-push` nueva (acepta `kind: 'listing'`) → migración. Con la migración puesta y la función
-- vieja, `send-push` respondería 400 a cada aviso y la publicación quedaría marcada como avisada sin que
-- nadie recibiera nada: la función va primero. El frontend no cambia.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES: `if not exists`, `create or replace` y `cron.schedule` con nombre.
-- =============================================================================

create table if not exists public.publication_expiry_notices (
  item_id    bigint primary key references public.hub_market_items(id) on delete cascade,
  -- El `expires_at` para el que ya se pidió el aviso. Renovar lo cambia y vuelve a habilitar el aviso.
  warned_for timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.publication_expiry_notices is
  'Para qué fecha de vencimiento ya se avisó al dueño de una publicación (0031). Solo la lee y escribe warn_expiring_publications().';

-- Nadie del navegador la toca: sin políticas y sin permisos.
alter table public.publication_expiry_notices enable row level security;
revoke all on public.publication_expiry_notices from public;
revoke all on public.publication_expiry_notices from anon;
revoke all on public.publication_expiry_notices from authenticated;


create or replace function public.warn_expiring_publications()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c_window constant interval := interval '7 days';  -- el mismo RENEW_WARNING_DAYS del frontend
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
    return 'sin enlace de avisos: no se aviso a nadie';
  end if;

  for v_item in
    select i.id, i.expires_at
      from public.hub_market_items i
     where i.is_active
       and i.status = 'aprobado'
       and not i.is_test
       and i.sold_at is null
       and i.seller_id is not null
       and i.expires_at >  now()
       and i.expires_at <= now() + c_window
       and not exists (
         select 1 from public.publication_expiry_notices w
          where w.item_id = i.id and w.warned_for = i.expires_at
       )
     order by i.expires_at
  loop
    begin
      perform net.http_post(
        url     := v_url,
        body    := jsonb_build_object('kind', 'listing', 'id', v_item.id),
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || v_anon,
                     'x-push-secret', v_secret
                   )
      );

      insert into public.publication_expiry_notices (item_id, warned_for)
      values (v_item.id, v_item.expires_at)
      on conflict (item_id) do update set warned_for = excluded.warned_for, created_at = now();

      v_count := v_count + 1;
    exception when others then
      raise warning 'warn_expiring_publications (publicacion %): %', v_item.id, sqlerrm;
    end;
  end loop;

  return v_count || ' avisos pedidos';
end;
$$;

comment on function public.warn_expiring_publications() is
  'Cron diario (0031): le pide a send-push que avise al dueño de cada publicación que vence en los próximos 7 días y todavía no avisó. Nunca falla por un aviso que no sale.';

-- Solo el cron la invoca (las tres líneas).
revoke all on function public.warn_expiring_publications() from public;
revoke execute on function public.warn_expiring_publications() from anon;
revoke execute on function public.warn_expiring_publications() from authenticated;

-- 09:00 hora de República Dominicana (UTC-4): un aviso que se lee de día. `cron.schedule` con nombre reemplaza.
select cron.schedule('warn-expiring-publications', '0 13 * * *', 'select public.warn_expiring_publications()');
