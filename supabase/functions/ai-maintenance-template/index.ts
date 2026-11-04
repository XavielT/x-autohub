// =============================================================================
// ai-maintenance-template — la guía de mantenimiento de un vehículo del garaje
// =============================================================================
//
// La llama una persona con sesión desde "Mi garaje": `{ profile_vehicle_id }`. Genera UNA guía por (marca, modelo, rango de años) y la guarda para todos
// (`vehicle_maintenance_templates`, migración 0058): si ya existe una que cubra el año de ese vehículo, NO vuelve a llamar a la IA y devuelve la que hay.
//
// SOLO intervalos y nombres de tareas (aceite, filtros, frenos, batería, bujías, correa, A/C, rotación, alineación, líquido de frenos, refrigerante): nada de torques,
// capacidades ni datos técnicos finos. Los intervalos ya van ajustados al uso en RD (calor, tráfico, polvo → servicio severo). Todo se valida aquí y en SQL:
// el vehículo tiene que ser de quien llama (se lee con SU sesión, no con la service_role), los intervalos tienen que ser razonables, los renglones con unidades
// técnicas se descartan y `category_slug` / `service_slug` se comprueban contra las tablas reales (lo que no existe queda nulo).
// La guía nace "sin revisar": la pantalla dice "Guía general generada con IA; confírmala con el manual de tu carro o con el taller".
//
// Secretos: ANTHROPIC_API_KEY.

import { callAI } from '../_shared/ai.ts';
import { readEnv, rest, rpc, type Env } from '../_shared/db.ts';
import { corsHeaders, readJson, refuse, reply, requireUser, unavailableReply } from '../_shared/guard.ts';
import type { Schema } from '../_shared/schema.ts';

const SCHEMA: Schema = {
  t: 'object',
  props: {
    year_from: { t: 'number', int: true, min: 1950, max: 2100 },
    year_to: { t: 'number', int: true, min: 1950, max: 2100 },
    engine_note: { t: 'string', max: 80, nullable: true, optional: true },
    items: {
      t: 'array',
      max: 14,
      of: {
        t: 'object',
        props: {
          key: { t: 'string', max: 40 },
          label: { t: 'string', max: 80 },
          every_km: { t: 'number', int: true, nullable: true, optional: true },
          every_months: { t: 'number', int: true, nullable: true, optional: true },
          severity: { t: 'string', enum: ['normal', 'severo'] },
          category_slug: { t: 'string', max: 60, nullable: true, optional: true },
          service_slug: { t: 'string', max: 60, nullable: true, optional: true },
        },
      },
    },
  },
};

interface Generated {
  year_from: number; year_to: number; engine_note?: string | null;
  items: { key: string; label: string; every_km?: number | null; every_months?: number | null; severity: 'normal' | 'severo'; category_slug?: string | null; service_slug?: string | null }[];
}

/** Torques, capacidades y medidas finas: no van en esta guía. Un renglón que las nombre se descarta. */
const TECHNICAL = /\d\s*(nm|n·m|lb[- ]?ft|ft[- ]?lb|litros?|lts?|qt|quarts?|psi|bar|kpa|mm|cc)\b|\b(torque|capacidad|viscosidad|sae|w-?\d{2})\b/i;

const SYSTEM = [
  'Armas una guía GENERAL de mantenimiento preventivo para un vehículo que se usa en República Dominicana (calor, tráfico pesado, polvo y calles en mal estado): usa intervalos de SERVICIO SEVERO.',
  'Devuelve JSON: year_from y year_to (el rango de años de la misma generación del vehículo, que incluya el año dado, de máximo 12 años), engine_note (motor, solo si lo sabes con certeza) y items.',
  'Cada item: key (corto, sin espacios), label (nombre de la tarea en español), every_km y/o every_months (al menos uno), severity ("severo" si el intervalo ya está ajustado al uso severo), category_slug (de la lista de categorías, o null) y service_slug (de la lista de servicios del taller, o null).',
  'Tareas posibles: aceite y filtro, filtro de aire, filtro de cabina, filtro de combustible, pastillas/frenos, líquido de frenos, refrigerante, batería, bujías, correa, aire acondicionado, rotación de llantas, alineación y balanceo.',
  'SOLO intervalos y nombres de tareas. PROHIBIDO: torques, capacidades de aceite o líquidos, viscosidades, presiones, medidas o cualquier dato técnico fino. Si no estás seguro de un intervalo, usa uno conservador.',
].join('\n');

async function asUser(env: Env, req: Request, path: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: req.headers.get('Authorization') ?? '' } });
    return res.ok ? ((await res.json()) as unknown[]) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return refuse(req, 405, 'method-not-allowed');
  const env = readEnv();
  if (!env) return unavailableReply(req);

  const caller = await requireUser(env, req);
  if (!caller) return refuse(req, 403, 'forbidden');

  const body = await readJson(req, 1000);
  const vehicleId = body?.profile_vehicle_id;
  if (typeof vehicleId !== 'number' || !Number.isSafeInteger(vehicleId) || vehicleId <= 0) return refuse(req, 400, 'bad-request');

  // El vehículo se lee con la sesión de quien llama: RLS devuelve solo los suyos.
  const vehicle = ((await asUser(env, req, `profile_vehicles?select=make_id,model_id,year&id=eq.${vehicleId}&limit=1`)) as { make_id: number; model_id: number | null; year: number }[] | null)?.[0];
  if (!vehicle) return refuse(req, 404, 'not-found');
  if (vehicle.model_id === null) return reply(req, 200, { ok: false, code: 'sin_modelo' });

  // Si ya hay una guía que cubra el año, no se paga otra: se devuelve esa.
  const existing = await rpc<number | null>(env, 'find_maintenance_template', { p_make_id: vehicle.make_id, p_model_id: vehicle.model_id, p_year: vehicle.year });
  if (typeof existing === 'number') return reply(req, 200, { ok: true, data: { template_id: existing, created: false } });

  // Tope por persona: una guía por vehículo no necesita más de unas pocas llamadas por hora.
  const allowed = await rpc<boolean>(env, 'ai_rate_check', { p_key: `maintenance:${caller.userId}`, p_window_seconds: 3600, p_max: 6 });
  if (allowed !== true) return refuse(req, 429, 'demasiadas_guias');

  const [make, model, categories, services] = await Promise.all([
    rest<{ name: string }[]>(env, `vehicle_makes?select=name&id=eq.${vehicle.make_id}&limit=1`),
    rest<{ name: string }[]>(env, `vehicle_models?select=name&id=eq.${vehicle.model_id}&limit=1`),
    rest<{ slug: string; name: string }[]>(env, 'product_categories?select=slug,name&is_active=eq.true'),
    rest<{ slug: string; title: string }[]>(env, 'services?select=slug,title&is_active=eq.true'),
  ]);
  if (!make?.[0] || !model?.[0]) return unavailableReply(req);

  const out = await callAI<Generated>(env, {
    feature: 'maintenance',
    tier: 'fast',
    system: SYSTEM,
    user:
      `Vehículo: ${make[0].name} ${model[0].name} ${vehicle.year}.\n` +
      `CATEGORÍAS (slug = nombre): ${(categories ?? []).map((c) => `${c.slug} = ${c.name}`).join('; ')}\n` +
      `SERVICIOS DEL TALLER (slug = nombre): ${(services ?? []).filter((s) => s.slug).map((s) => `${s.slug} = ${s.title}`).join('; ')}`,
    schema: SCHEMA,
    maxTokens: 1200,
    userId: caller.userId,
  });
  if (!out.ok) return unavailableReply(req);

  const g = out.data;
  // El rango tiene que incluir el año del vehículo y ser razonable; si la IA se pasó, se acota a un rango sensato alrededor del año.
  let from = Math.min(g.year_from, vehicle.year);
  let to = Math.max(g.year_to, vehicle.year);
  if (to - from > 12) {
    from = vehicle.year - 4;
    to = vehicle.year + 4;
  }

  const seen = new Set<string>();
  const items = g.items.flatMap((it) => {
    const key = it.key.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    const km = it.every_km != null && it.every_km >= 1000 && it.every_km <= 200000 ? it.every_km : null;
    const months = it.every_months != null && it.every_months >= 1 && it.every_months <= 60 ? it.every_months : null;
    // Sin un intervalo razonable, una clave repetida o con datos técnicos finos: se descarta (nunca se arregla a ojo).
    if (!key || seen.has(key) || (km === null && months === null) || TECHNICAL.test(it.label) || it.label.trim().length < 2) return [];
    seen.add(key);
    return [{ key, label: it.label.trim(), every_km: km, every_months: months, severity: it.severity, category_slug: it.category_slug ?? null, service_slug: it.service_slug ?? null }];
  });
  if (items.length < 3) return unavailableReply(req);

  const id = await rpc<number>(env, 'ai_save_maintenance_template', {
    p_make_id: vehicle.make_id, p_model_id: vehicle.model_id, p_year_from: from, p_year_to: to, p_engine_note: g.engine_note ?? null, p_items: items, p_model: out.model,
  });
  if (typeof id !== 'number') return unavailableReply(req);
  return reply(req, 200, { ok: true, data: { template_id: id, created: true, items: items.length } });
});
