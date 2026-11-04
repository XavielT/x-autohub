-- =============================================================================
-- X AutoHub — Fija el search_path de cinco funciones auxiliares de la IA
-- =============================================================================
--
-- El linter de Supabase (`function_search_path_mutable`) marcó cinco funciones que se crearon en 0051, 0055 y 0058 sin `set search_path`. Ninguna es explotable
-- (solo manipulan texto o ponen `updated_at`), pero una función sin ruta fija usa la del rol que la llama. Se les fija `public` con un ALTER: no cambia su cuerpo,
-- su volatilidad (`xah_*` siguen siendo IMMUTABLE, que es lo que exige la columna generada `search_vector`) ni sus permisos.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

alter function public.xah_join(text[])                       set search_path = public;
alter function public.xah_norm_part(text)                    set search_path = public;
alter function public.xah_norm_parts(text[])                 set search_path = public;
alter function public.maintenance_items_valid(jsonb)         set search_path = public;
alter function public.service_quote_requests_touch()         set search_path = public;
