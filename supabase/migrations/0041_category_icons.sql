-- 0041 — Iconos de las categorías.
--
-- `product_categories.icon` (0017) estaba nula "hasta que la fase 2 decida la iconografía".
-- Ahora guarda el nombre del archivo, sin extensión: `frenos` → `assets/icons/categories/frenos.svg`.
-- El nombre coincide con el slug. Una categoría sin icono (o con uno que no existe) cae a
-- la inicial en el chip del home.
--
-- Solo se llena donde está vacío: si alguien eligió otro icono desde el panel, se respeta.

update public.product_categories
   set icon = slug
 where icon is null
   and slug in (
     'accesorios-interior', 'accesorios-exterior', 'iluminacion', 'audio-multimedia',
     'llantas-aros', 'frenos', 'suspension', 'motor-filtros', 'electrico-baterias',
     'aire-acondicionado', 'limpieza-detailing', 'herramientas-emergencia'
   );
