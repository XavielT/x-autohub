-- =============================================================================
-- X AutoHub — Renombra hub_parts.stars_calification a stars_rating
-- =============================================================================
--
-- ⚠️ ESTA MIGRACIÓN TODAVÍA NO SE HA EJECUTADO. Ver docs/ROADMAP.md.
--
-- El modelo del frontend siempre usó `starsRating`; la columna se quedó con el
-- nombre viejo y `mappers.ts` absorbía la diferencia. Esto la alinea.
--
-- CÓMO APLICARLA — los tres pasos van en el MISMO commit, o un `select` con la
-- columna vieja llega a producción:
--
--   1. Ejecuta este archivo en el SQL Editor del dashboard.
--   2. En `src/core/supabase/database.types.ts`, cambia
--        stars_calification: number;   ->   stars_rating: number;
--   3. En `src/core/supabase/mappers.ts` (línea ~84), cambia
--        starsRating: Number(row.stars_calification),
--      por
--        starsRating: Number(row.stars_rating),
--
--      Y en `mappers.spec.ts` (línea ~127) el mismo cambio de nombre.
--
-- TypeScript te señalará cualquier punto que se quede atrás.
--
-- Nota: `seed.sql` también menciona la columna vieja. Si vuelves a sembrar una
-- base desde cero, regenéralo con `node scripts/generate-seed.mjs` después de
-- aplicar esto.
-- =============================================================================

alter table public.hub_parts
  rename column stars_calification to stars_rating;

-- El check viaja con la columna, pero su nombre queda desactualizado. Se generó
-- solo (era un `check` en línea), así que se renombra únicamente si existe con
-- el nombre esperado: si Postgres lo llamó de otra forma, esto no falla.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'hub_parts_stars_calification_check'
      and conrelid = 'public.hub_parts'::regclass
  ) then
    alter table public.hub_parts
      rename constraint hub_parts_stars_calification_check to hub_parts_stars_rating_check;
  end if;
end $$;
