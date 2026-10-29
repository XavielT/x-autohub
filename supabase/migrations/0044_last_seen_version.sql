-- 0044 — "Novedades de la actualización".
--
--   · `profiles.last_seen_version` — la última versión del sitio cuyas novedades vio esa
--     persona. La escribe solo su dueña (la política de update de 0009 exige
--     `auth.uid() = id`, con `using` y `with check`); no hay otra vía de escritura. Nula =
--     nunca vio ninguna: la primera visita no muestra nada y guarda la versión actual.
--   · `releases.user_summary` — el resumen para quien usa el sitio, en español llano.
--     `title` y `summary` son del equipo (salen de las notas técnicas del tag); la modal
--     usa `user_summary` si existe y, si no, `summary`.
--
-- Los resúmenes de las versiones 2.25 a 2.29 se redactan aquí. Las anteriores quedan
-- vacías a propósito. Solo se llena donde está vacío: si se editó desde el panel, se respeta.

alter table public.profiles
  add column if not exists last_seen_version text;

alter table public.profiles
  drop constraint if exists profiles_last_seen_version_format;
alter table public.profiles
  add constraint profiles_last_seen_version_format
  check (last_seen_version is null or last_seen_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$');

-- `email` y `phone` no se leen con las claves del navegador (0006), pero esta columna sí:
-- no tiene nada de privado y la app la pide con un select directo.
grant select (last_seen_version) on public.profiles to authenticated;

alter table public.releases
  add column if not exists user_summary text;

update public.releases r
   set user_summary = v.texto
  from (values
    ('2.25.0', 'Ahora puedes guardar productos con el corazón y verlos en Mis favoritos, en tu perfil.'),
    ('2.26.0', 'Los filtros de Auto Hub quedan en el enlace: puedes compartir una búsqueda o recargar sin perderla.'),
    ('2.27.0', 'Mis favoritos tiene su enlace en el menú de tu cuenta, con el contador.'),
    ('2.27.1', 'Mejoras por dentro para que borrar productos sea más rápido. No cambia nada de lo que ves.'),
    ('2.27.2', 'Guardar o quitar un favorito sin buena conexión ya no deja el corazón a medias.'),
    ('2.28.0', 'Auto Hub se ve en tarjetas de una a tres columnas, y arreglamos un desborde en teléfonos.'),
    ('2.28.1', 'Hub Market y otras páginas ya no se salen de la pantalla en el teléfono.'),
    ('2.28.2', 'Revisamos tu perfil, publicar, el checkout y el panel en teléfonos: todo cabe en pantalla.'),
    ('2.28.3', 'Pequeños ajustes de carga para que el sitio abra más rápido.'),
    ('2.28.4', 'Pequeños ajustes de carga para que el sitio abra más rápido.'),
    ('2.28.5', 'Pequeños ajustes de carga para que el sitio abra más rápido.'),
    ('2.29.0', 'El sitio abre más rápido: carga lo justo al empezar y lo demás cuando lo necesitas.'),
    ('2.29.1', 'Medimos la mejora de velocidad del sitio. No cambia nada de lo que ves.'),
    ('2.29.2', 'Las páginas con datos, como Auto Hub, pintan más rápido.'),
    ('2.29.3', 'Ajustes internos de medición. No cambia nada de lo que ves.'),
    ('2.29.4', 'En el teléfono, los filtros de Auto Hub ocupan menos espacio.')
  ) as v(version, texto)
 where r.version = v.version
   and (r.user_summary is null or btrim(r.user_summary) = '');
