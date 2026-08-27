-- =============================================================================
-- X AutoHub — Baja del Club: un token por suscriptor
-- =============================================================================
--
-- Hasta ahora el correo de bienvenida pedia "responde BAJA y te sacamos de la
-- lista", y sacar a alguien era trabajo a mano. Con un suscriptor alcanzaba; con
-- cien, no — y una lista de la que no se puede salir con un clic es exactamente
-- lo que hace que un correo termine marcado como spam.
--
-- Esta migracion trae las dos piezas: un token por fila y la funcion que lo usa.
--
--
-- POR QUE UN TOKEN Y NO EL CORREO
-- -------------------------------
-- Porque un enlace con el correo dentro (`/baja?email=quien@sea.com`) deja que
-- cualquiera dé de baja a cualquiera con solo escribir la direccion. El token es
-- un uuid que no se adivina, y solo lo conoce quien recibio el correo.
--
--
-- POR QUE SE BORRA LA FILA Y NO SE MARCA
-- --------------------------------------
-- Se penso en un `unsubscribed_at` (guardar la fila y marcarla), que es lo
-- habitual en listas grandes: sirve de lista de supresion y evita volver a
-- escribirle a quien ya dijo que no.
--
-- Se descarto **para esta lista** por una razon concreta: al volver a
-- suscribirse desde el home, el insert choca con el `unique` del correo y el
-- cliente lo trata como "ya estabas en el club" (23505). O sea que alguien que se
-- dio de baja y se arrepiente quedaria en una lista de la que nunca mas recibe
-- nada, sin manera de arreglarlo desde la interfaz. Para soportarlo bien habria
-- que convertir tambien el alta en una funcion que reactive la fila, y eso es
-- mas cambio del que justifica una lista de un suscriptor.
--
-- Borrar es honesto —"te sacamos de la lista" saca de verdad— y volver a
-- suscribirse funciona sin nada extra. Cuando la lista crezca y haya campañas de
-- por medio, toca la lista de supresion: esta anotado en docs/BACKEND.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. El token
-- -----------------------------------------------------------------------------
-- El default es volatil, asi que Postgres reescribe la tabla y evalua
-- `gen_random_uuid()` **una vez por fila**: las suscripciones que ya existen
-- reciben cada una su token, no todas el mismo.

alter table public.club_subscriptions
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'club_subscriptions_unsubscribe_token_key'
  ) then
    alter table public.club_subscriptions
      add constraint club_subscriptions_unsubscribe_token_key unique (unsubscribe_token);
  end if;
end
$$;

comment on column public.club_subscriptions.unsubscribe_token is
  'Va en el enlace de baja del correo. No se puede leer con las claves del navegador.';

-- No hace falta politica nueva: la tabla no tiene select para `anon` desde 0002
-- (la lista de correos no se descarga), asi que el token tampoco se puede leer.
-- Quien lo necesita es la funcion de abajo, que corre como definer, y la Edge
-- Function del correo, que usa la clave service_role.


-- -----------------------------------------------------------------------------
-- 2. Darse de baja
-- -----------------------------------------------------------------------------
-- `security definer` porque la tabla no tiene politica de delete para nadie: el
-- unico camino para salir de la lista es este, con el token en la mano.
--
-- Y **si** se le da a `anon`, al contrario de las funciones de 0015: el enlace se
-- abre desde el correo, casi siempre sin sesion. Es el mismo caso que
-- `create_order()` con el checkout de invitado.
--
-- Devuelve un booleano y no lanza cuando el token no existe. Que no exista es lo
-- normal: es lo que pasa al abrir dos veces el mismo enlace, y no es un error
-- que haya que enseñarle a nadie.

create or replace function public.unsubscribe_from_club(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  -- El texto se valida antes de convertirlo. Un `p_token::uuid` sobre lo que
  -- venga del navegador responderia `22P02` a cualquier cosa que no sea un uuid,
  -- y un enlace roto en un correo es lo mas normal del mundo — se merece un "ese
  -- enlace no vale", no un error de base de datos.
  if p_token is null or p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  delete from public.club_subscriptions
   where unsubscribe_token = p_token::uuid;

  get diagnostics v_deleted = row_count;

  return v_deleted > 0;
end;
$$;

comment on function public.unsubscribe_from_club(text) is
  'Saca de la lista del club a quien tenga ese token. true si habia alguien; false si no.';

revoke all on function public.unsubscribe_from_club(text) from public;
grant execute on function public.unsubscribe_from_club(text) to anon, authenticated;
