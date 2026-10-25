-- =============================================================================
-- X AutoHub — Auto Hub y Hub Market también republican el sitio
-- =============================================================================
--
-- La 2.15.0 prerenderiza el listado de Auto Hub, la ficha de cada vehículo, el listado de
-- Hub Market y la ficha de cada publicación aprobada. Esas páginas son una foto del último
-- despliegue, igual que las de la tienda, así que los cambios de estas dos tablas tienen que
-- pedir un despliegue como los de `hub_parts` (0026): si no, un vehículo vendido o una
-- publicación rechazada seguiría en el HTML que lee un buscador hasta el siguiente release.
--
-- Solo hace falta enchufar `mark_site_dirty()` a las dos tablas; la lógica (esperar a que el
-- panel se calle, no más de un despliegue cada 10 minutos, ignorar lo que cambia con cada
-- compra) es la de la 0026 y no cambia.
--
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **Cualquier cambio de estas tablas marca el sitio**, también el de una publicación todavía
--   pendiente (que nadie ve): moderar es justo lo que publica o quita una ficha, y distinguir
--   "lo que se ve" dentro del trigger obligaría a repetir aquí las reglas de RLS. El costo de
--   un marcado de más es un despliegue que se pide como mucho una vez cada 10 minutos.
-- · **No hay columnas que cambien con cada visita.** Ninguna de las dos tablas lleva contador de
--   vistas ni de ventas; si algún día se agrega una, hay que sumarla a la lista que ignora
--   `mark_site_dirty()` (ver la 0026), o cada visita pedirá un despliegue.
--
--
-- ORDEN DE DESPLIEGUE
-- -------------------
-- Migración → frontend. Sin frontend nuevo la migración solo pide despliegues de un sitio que
-- todavía no prerenderiza estas páginas: inofensivo. Se puede desplegar en cualquier orden.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES: `drop trigger if exists` + `create trigger`.
-- =============================================================================

drop trigger if exists auto_hub_vehicles_mark_site_dirty on public.auto_hub_vehicles;
create trigger auto_hub_vehicles_mark_site_dirty
  after insert or update or delete on public.auto_hub_vehicles
  for each row execute function public.mark_site_dirty();

drop trigger if exists hub_market_items_mark_site_dirty on public.hub_market_items;
create trigger hub_market_items_mark_site_dirty
  after insert or update or delete on public.hub_market_items
  for each row execute function public.mark_site_dirty();
