-- =============================================================================
-- X AutoHub — Foto por opción (pulido de las variantes)
-- =============================================================================
--
-- Al elegir un color en la ficha, la galería salta a la foto de ese color. Cada opción
-- de `product_variants` puede apuntar a **una** de las fotos del producto.
--
--   · `image_url`: la URL de la foto (la misma que ya está en `hub_parts.images`). Nula =
--     la opción no tiene foto propia y la galería se queda como estaba.
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **Una foto por opción, y de las del producto.** No se sube una foto aparte: el panel
--   ofrece las que el producto ya tiene. Así no hay un segundo sitio donde borrar fotos
--   de Storage ni una opción apuntando a una imagen que desapareció con el producto.
-- · **Sin llave foránea ni check de pertenencia.** `hub_parts.images` es un arreglo de
--   texto y la base no puede exigir que la URL esté dentro. Si el equipo quita esa foto
--   del producto, la opción queda apuntando a una URL que la galería no encuentra: la
--   ficha lo trata como "sin foto propia" (no salta a ningún sitio) y no se rompe nada.
-- · El trigger que suma el stock no se toca: esta columna no entra en ninguna cuenta.
--
-- ORDEN DE DESPLIEGUE
-- -------------------
-- **Primero esta migración, después el frontend**: el frontend nuevo pide `image_url` en
-- sus `select`. El anterior no la conoce y sigue funcionando.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

alter table public.product_variants
  add column if not exists image_url text;

do $$
begin
  alter table public.product_variants
    add constraint product_variants_image_url_check
    check (image_url is null or (char_length(image_url) between 1 and 2048));
exception when duplicate_object then null;
end
$$;

comment on column public.product_variants.image_url is
  'Una de las fotos del producto (hub_parts.images) que se enseña al elegir esta opción. Nula = sin foto propia.';
