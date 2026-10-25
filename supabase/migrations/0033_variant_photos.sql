-- =============================================================================
-- X AutoHub — Varias fotos por opción
-- =============================================================================
--
-- La 0025 le dio a cada opción de `product_variants` **una** foto (`image_url`): al elegir "Negro" la
-- galería saltaba a esa foto. Un color suele necesitar varias (de frente, de lado, el detalle), así que
-- esta migración agrega `image_urls`, la lista de fotos de la opción.
--
--   · `image_urls`: las fotos de la opción, en el orden en que la ficha las enseña. La primera es la
--     portada: la que sale en el carrito y en el checkout. Vacía = la opción no tiene fotos propias.
--   · `image_url` **se queda**, como espejo de la primera de `image_urls`.
--
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **Siguen siendo fotos del producto.** Igual que en la 0025, no se sube nada aparte: el panel ofrece
--   las fotos que el producto ya tiene (`hub_parts.images`). Así no hay un segundo
--   sitio donde borrar fotos de Storage. Una opción puede compartir una foto con otra.
-- · **`image_url` no se borra, y un trigger lo mantiene.** Se migra primero y se despliega después, y en
--   medio hay frontend viejo escribiendo `image_url`. El trigger deja a las dos columnas de acuerdo
--   escriba quien escriba:
--     - al insertar: si solo trae `image_url`, `image_urls` pasa a ser `[image_url]`; si no, `image_url`
--       es la primera de `image_urls`;
--     - al actualizar: si `image_urls` no cambió pero `image_url` sí (el frontend viejo), manda
--       `image_url`; en cualquier otro caso manda `image_urls`.
--   Cuando ningún frontend viejo quede, quitar `image_url` es una migración aparte (y el frontend deja de
--   pedirla antes, como con cualquier columna).
-- · **Tope de 8 fotos por opción** y un largo total acotado: una opción con 40 fotos no es una galería, es un
--   descuido. Cada URL no se puede revisar con un \`check\` (no admite subconsultas); el frontend solo ofrece
--   las del producto.
-- · Esta columna no entra en ninguna cuenta de stock: \`product_variants_sync()\` no se toca.
--
--
-- ORDEN DE DESPLIEGUE
-- -------------------
-- **Primero esta migración, después el frontend**: el frontend nuevo pide `image_urls` en sus `select`. El
-- anterior no la conoce y sigue funcionando gracias al trigger.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

alter table public.product_variants
  add column if not exists image_urls text[] not null default '{}';

-- Lo que ya había: la foto única pasa a ser la primera (y única) de la lista. Un `where` para que repetir la
-- migración no pise lo que el panel ya haya guardado.
update public.product_variants
   set image_urls = array[image_url]
 where image_url is not null
   and cardinality(image_urls) = 0;

do $$
begin
  alter table public.product_variants
    add constraint product_variants_image_urls_check
    check (cardinality(image_urls) <= 8 and char_length(array_to_string(image_urls, ' ')) <= 16384);
exception when duplicate_object then null;
end
$$;

comment on column public.product_variants.image_urls is
  'Las fotos de esta opción (de las de hub_parts.images), en el orden en que se enseñan; la primera es la portada (0033). Vacía = sin fotos propias.';
comment on column public.product_variants.image_url is
  'Espejo de la primera de image_urls (0033), para el frontend anterior. No escribir: lo mantiene el trigger product_variants_photos_sync.';


create or replace function public.product_variants_photos_sync()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if cardinality(new.image_urls) = 0 and new.image_url is not null then
      new.image_urls := array[new.image_url];
    else
      new.image_url := new.image_urls[1];
    end if;
  else
    if new.image_urls is not distinct from old.image_urls and new.image_url is distinct from old.image_url then
      -- Un frontend anterior a la 0033 cambió solo la foto de la opción.
      new.image_urls := case when new.image_url is null then '{}'::text[] else array[new.image_url] end;
    else
      new.image_url := new.image_urls[1];
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists product_variants_photos_sync on public.product_variants;
create trigger product_variants_photos_sync
  before insert or update on public.product_variants
  for each row execute function public.product_variants_photos_sync();
