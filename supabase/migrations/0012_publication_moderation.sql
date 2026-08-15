-- =============================================================================
-- X AutoHub — Moderación de publicaciones de Hub Market
-- =============================================================================
--
-- Lo que publica la comunidad deja de ser público en el momento en que se
-- guarda. Pasa a un estado `pendiente` y no se ve en el sitio hasta que un
-- moderador o un admin la aprueba.
--
--   pendiente  → recién publicada. Solo la ven su dueño y quien modera.
--   aprobado   → visible para todos. Es lo único que sale en Hub Market.
--   rechazado  → no se publica. Su dueño ve el motivo en /perfil.
--
-- Quien modera (`is_moderator_or_admin()`, migración 0011) publica directo en
-- `aprobado`: no tiene sentido que se aprueben a sí mismos por un formulario.
--
--
-- CÓMO SE PROTEGEN LAS COLUMNAS DE MODERACIÓN
-- -------------------------------------------
-- El prompt daba a elegir entre una función `security definer` o una política de
-- update. Aquí van **las dos, y no es indecisión**: hacen cosas distintas y una
-- sola no alcanza.
--
--   · El **trigger de congelado** es lo que de verdad cierra la puerta. RLS no
--     filtra por columna — la lección que ya costó una escalada de privilegios
--     en 0005 — así que la política de update "puedes editar tu publicación" no
--     puede impedir que la fila que mandas traiga `status = 'aprobado'`. El
--     trigger sí: si quien escribe no modera, `status`, `rejection_reason` y los
--     `reviewed_*` vuelven a su valor anterior, en silencio, igual que hace
--     `freeze_profile_privileges` con `is_admin`.
--
--   · La **función `moderate_publication()`** es el único camino sancionado
--     para cambiarlos. No es la barrera: es la puerta. Existe para que la
--     transición sea atómica y completa —estado, motivo, quién revisó y cuándo,
--     todo junto— en vez de un `update` suelto donde es fácil olvidar el
--     `reviewed_by` y quedarse sin saber quién aprobó qué.
--
-- Es el mismo reparto que ya usa el esquema para los privilegios de perfil
-- (trigger 0005 + `set_user_admin` 0007). Se repite a propósito: un patrón
-- conocido se audita más rápido que uno nuevo.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Las columnas
-- -----------------------------------------------------------------------------

alter table public.hub_market_items
  add column if not exists status text not null default 'pendiente';

alter table public.hub_market_items
  drop constraint if exists hub_market_status_valid;

alter table public.hub_market_items
  add constraint hub_market_status_valid
  check (status in ('pendiente', 'aprobado', 'rechazado'));

alter table public.hub_market_items
  add column if not exists rejection_reason text;

-- `on delete set null`: si se borra la cuenta de quien moderó, la decisión sigue
-- registrada. Perder el historial de moderación por dar de baja a un empleado
-- sería peor que no saber quién fue.
alter table public.hub_market_items
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.hub_market_items
  add column if not exists reviewed_at timestamptz;

comment on column public.hub_market_items.status is
  'pendiente | aprobado | rechazado. Solo lo mueve moderate_publication(); el trigger lo congela.';
comment on column public.hub_market_items.rejection_reason is
  'Por que se rechazo. Lo lee su dueño en /perfil, asi que se escribe para el, no para el equipo.';

-- Todo lo que ya existía se da por aprobado: son las publicaciones sembradas y
-- las que la comunidad hizo cuando no había cola de revisión. Hacerlas
-- `pendiente` vaciaría Hub Market de golpe y le pondría a alguien una cola de
-- revisión falsa el día del despliegue.
update public.hub_market_items
   set status = 'aprobado'
 where status = 'pendiente';

-- La cola de revisión se consulta por estado y por fecha, y es lo que abre el
-- moderador cada vez que entra al panel.
create index if not exists hub_market_items_status_idx
  on public.hub_market_items (status, created_at desc);


-- -----------------------------------------------------------------------------
-- 2. Estado forzado al publicar
-- -----------------------------------------------------------------------------
-- El estado inicial no se le pregunta al cliente. Aunque la política de insert
-- podría exigir `status = 'pendiente'` en su `with check`, eso obliga al cliente
-- a mandar el valor correcto: aquí se le impone, que es más difícil de saltar y
-- más simple de leer.

create or replace function public.force_publication_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin sesión no hay a quién aplicarle la regla: eso es el seed o un script con
  -- la clave `service_role`, que escriben el estado a propósito y a los que hay
  -- que dejarles sembrar publicaciones ya aprobadas. No abre ningún hueco: la
  -- política de insert es `to authenticated`, así que todo insert que venga del
  -- navegador trae `auth.uid()`.
  if auth.uid() is null then
    return new;
  end if;

  if public.is_moderator_or_admin() then
    -- Quien modera publica directo. Si manda un estado raro, se normaliza.
    new.status := coalesce(nullif(new.status, ''), 'aprobado');
    if new.status not in ('pendiente', 'aprobado', 'rechazado') then
      new.status := 'aprobado';
    end if;
  else
    new.status := 'pendiente';
  end if;

  -- Nadie nace revisado ni rechazado.
  new.rejection_reason := null;
  new.reviewed_by      := null;
  new.reviewed_at      := null;

  return new;
end;
$$;

drop trigger if exists hub_market_force_status on public.hub_market_items;

create trigger hub_market_force_status
  before insert on public.hub_market_items
  for each row execute function public.force_publication_status();


-- -----------------------------------------------------------------------------
-- 3. Congelado de las columnas de moderación en el UPDATE
-- -----------------------------------------------------------------------------
-- Esto es lo que impide que el dueño de una publicación se apruebe solo con un
-- `update` normal. Congela en silencio, como el de perfiles, para que editar el
-- precio o el título de una publicación siga funcionando aunque el cliente
-- reenvíe el objeto completo.
--
-- `service_role` y el ajuste `app.allow_moderation` (que solo pone la función de
-- abajo, dentro de su propia transacción) son las únicas salidas. Desde
-- PostgREST no se puede poner un ajuste de transacción.

create or replace function public.freeze_publication_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and coalesce(current_setting('app.allow_moderation', true), '') <> 'on' then
    new.status           := old.status;
    new.rejection_reason := old.rejection_reason;
    new.reviewed_by      := old.reviewed_by;
    new.reviewed_at      := old.reviewed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists hub_market_freeze_moderation on public.hub_market_items;

create trigger hub_market_freeze_moderation
  before update on public.hub_market_items
  for each row execute function public.freeze_publication_moderation();


-- -----------------------------------------------------------------------------
-- 4. Visibilidad
-- -----------------------------------------------------------------------------
-- Se reemplaza la política de select de 0002, que solo miraba `is_active`.
--
-- Tres caminos, en este orden de lectura:
--   · cualquiera        → solo lo activo y aprobado;
--   · el dueño          → todo lo suyo, en el estado que sea (lo necesita para
--                         ver "Pendiente" y el motivo del rechazo en /perfil);
--   · moderador y admin → todo, que es de donde sale la cola de revisión.

drop policy if exists "publicaciones de Hub Market visibles para todos" on public.hub_market_items;

create policy "publicaciones aprobadas visibles para todos"
  on public.hub_market_items for select
  using (
    (is_active and status = 'aprobado')
    or seller_id = auth.uid()
    or public.is_moderator_or_admin()
  );

-- El update sigue siendo del dueño (y de quien modera), pero ya no puede tocar
-- las columnas de moderación: de eso se encarga el trigger de arriba.
drop policy if exists "cada usuario edita sus publicaciones" on public.hub_market_items;

create policy "cada usuario edita sus publicaciones"
  on public.hub_market_items for update
  using (seller_id = auth.uid() or public.is_moderator_or_admin())
  with check (seller_id = auth.uid() or public.is_moderator_or_admin());

drop policy if exists "cada usuario borra sus publicaciones" on public.hub_market_items;

create policy "cada usuario borra sus publicaciones"
  on public.hub_market_items for delete
  using (seller_id = auth.uid() or public.is_moderator_or_admin());


-- -----------------------------------------------------------------------------
-- 5. Aprobar o rechazar
-- -----------------------------------------------------------------------------
-- Deja la fila entera consistente en una sola transacción: estado, motivo, quién
-- revisó y cuándo. Un `update` suelto podría cambiar el estado y olvidarse del
-- `reviewed_by`, y entonces no habría forma de saber quién aprobó qué.
--
-- El motivo es obligatorio al rechazar porque lo lee el vendedor: un rechazo sin
-- explicación no le dice qué corregir, y garantiza que vuelva a publicar lo
-- mismo. Al aprobar se limpia, para que no quede el motivo de un rechazo
-- anterior colgando de una publicación ya aprobada.

create or replace function public.moderate_publication(
  p_id       bigint,
  p_decision text,
  p_reason   text default null
)
returns table (
  id               bigint,
  status           text,
  rejection_reason text,
  reviewed_by      uuid,
  reviewed_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_moderator_or_admin() then
    raise exception 'Solo un moderador o un administrador puede revisar publicaciones.'
      using errcode = '42501';
  end if;

  if p_decision not in ('aprobado', 'rechazado') then
    raise exception 'Decision no valida: %. Usa aprobado o rechazado.', p_decision
      using errcode = '22023';
  end if;

  if p_decision = 'rechazado' and (v_reason is null or length(v_reason) < 10) then
    raise exception 'Explica en al menos 10 caracteres por que se rechaza.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.hub_market_items i where i.id = p_id) then
    raise exception 'Esa publicacion no existe.' using errcode = '22023';
  end if;

  perform set_config('app.allow_moderation', 'on', true);

  update public.hub_market_items i
     set status           = p_decision,
         rejection_reason = case when p_decision = 'rechazado' then v_reason else null end,
         reviewed_by      = v_caller,
         reviewed_at      = now()
   where i.id = p_id;

  perform set_config('app.allow_moderation', 'off', true);

  return query
    select i.id, i.status, i.rejection_reason, i.reviewed_by, i.reviewed_at
    from public.hub_market_items i
    where i.id = p_id;
end;
$$;

revoke all on function public.moderate_publication(bigint, text, text) from public;
grant execute on function public.moderate_publication(bigint, text, text) to authenticated;
