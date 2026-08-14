-- =============================================================================
-- X AutoHub — Teléfono de contacto en la publicación
-- =============================================================================
--
-- "Contactar vendedor" tiene que llegar al vendedor por su teléfono, en
-- WhatsApp. El problema es de dónde sale ese teléfono.
--
-- **No puede salir de `profiles`.** La migración 0006 le quitó `phone` (y
-- `email`) a las claves anon y authenticated porque cualquiera podía descargar
-- los de todos los usuarios. Ese cierre sigue en pie: un `join` a `profiles`
-- para leer el teléfono de otra persona lo reabriría entero, y de la peor forma
-- —sin que el dueño del número se entere.
--
-- Así que el teléfono vive en la publicación, no en la persona. La diferencia no
-- es solo técnica: es el vendedor quien lo escribe al publicar, es opcional, y
-- va publicación por publicación. Quien vende un carro puede dar su número y
-- quien vende una pieza puede no darlo, y borrarlo es dar de baja la
-- publicación, no editar su perfil.
--
-- Que la columna sea de lectura pública es intencional — es un clasificado, el
-- número está para que lo usen— y por eso el campo es opcional y no se rellena
-- solo con el teléfono del perfil sin que el usuario lo vea en el formulario.
--
-- Formato: **solo dígitos, sin código de país** (`8095550134`). La app lo
-- normaliza antes de guardar (`shared/utils/phone.ts`) y le antepone el `+1` al
-- armar el enlace de `wa.me`. El `check` es la red por debajo: sin él, una fila
-- escrita a mano con `(809) 555-0134` produciría un enlace de WhatsApp que no
-- abre nada, y el error se vería recién en el teléfono de alguien.
--
-- El rango 10-15 deja lugar a un E.164 completo si algún día se guarda con
-- código de país, sin necesitar otra migración; hoy la app siempre escribe 10.
--
-- Sin `grant`: `hub_market_items` tiene permisos a nivel de tabla, no de
-- columna, así que la columna nueva ya queda legible y escribible por las mismas
-- políticas RLS de la 0002 (leer todos, escribir solo lo propio).
-- =============================================================================

alter table public.hub_market_items
  add column if not exists contact_phone text;

alter table public.hub_market_items
  drop constraint if exists hub_market_contact_phone_digits;

alter table public.hub_market_items
  add constraint hub_market_contact_phone_digits
  check (contact_phone is null or contact_phone ~ '^[0-9]{10,15}$');

comment on column public.hub_market_items.contact_phone is
  'Telefono de WhatsApp del vendedor, solo digitos y sin codigo de pais (8095550134). Opcional.';
