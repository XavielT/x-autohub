// Prueba el handler de supabase/functions/ai-maintenance-template/index.ts sin Deno, sin Supabase y sin Anthropic:
//
//   node scripts/verify-ai-maintenance.mjs
//
// Recorre lo que importa: que solo una persona con sesión la llame y solo por un vehículo SUYO (se lee con su JWT, no con la service_role); que una guía ya
// guardada no se vuelva a pagar; que los intervalos absurdos y los renglones con torques, capacidades o presiones se descarten; que la guía se guarde por SQL
// (que valida los slugs contra las tablas reales); y que un fallo de la IA no deje nada guardado.

import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`   ${ok ? 'OK   ' : 'FALLA'} ${name}${ok ? '' : ` ${extra}`}`);
  if (!ok) failed++;
};

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-maint-')), 'handler.mjs');
await build({ entryPoints: ['supabase/functions/ai-maintenance-template/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });

let secrets, db, ai, calls;
globalThis.Deno = { env: { get: (k) => secrets[k] }, serve: (h) => { globalThis.__handler = h; } };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.startsWith('https://api.anthropic.com/')) {
    calls[calls.length - 1].parsed = JSON.parse(init.body);
    const r = ai();
    return typeof r === 'number' ? new Response('', { status: r }) : json({ content: [{ type: 'text', text: JSON.stringify(r) }], usage: { input_tokens: 500, output_tokens: 400 } });
  }
  if (url.endsWith('/auth/v1/user')) return init.headers.Authorization === 'Bearer token-usuario' ? json({ id: 'u-1' }) : json({}, 401);
  if (url.includes('/rest/v1/profile_vehicles?')) {
    calls[calls.length - 1].asUser = init.headers.Authorization;
    return json(init.headers.Authorization === 'Bearer token-usuario' ? db.vehicles : []);
  }
  if (url.includes('/rest/v1/site_settings')) { const key = decodeURIComponent(url.split('key=eq.')[1]?.split('&')[0] ?? ''); return json(key in db.settings ? [{ value: db.settings[key] }] : []); }
  if (url.endsWith('/rest/v1/rpc/ai_budget_status')) return json([{ tier: 'ok', pct: 1, public_ok: true }]);
  if (url.endsWith('/rest/v1/ai_usage')) return new Response('', { status: 201 });
  if (url.endsWith('/rest/v1/rpc/find_maintenance_template')) return json(db.existing);
  if (url.endsWith('/rest/v1/rpc/ai_rate_check')) { db.rate += 1; return json(db.rate <= 6); }
  if (url.includes('/rest/v1/vehicle_makes?')) return json([{ name: 'Toyota' }]);
  if (url.includes('/rest/v1/vehicle_models?')) return json([{ name: 'Corolla' }]);
  if (url.includes('/rest/v1/product_categories?')) return json([{ slug: 'filtros', name: 'Filtros' }]);
  if (url.includes('/rest/v1/services?')) return json([{ slug: 'cambio-aceite', title: 'Cambio de aceite' }]);
  if (url.endsWith('/rest/v1/rpc/ai_save_maintenance_template')) { db.saved.push(JSON.parse(init.body)); return json(db.saveId); }
  return json([], 404);
};
await import(pathToFileURL(out).href);
const handler = globalThis.__handler;

const GOOD = {
  year_from: 2014, year_to: 2019, engine_note: 'Motor 1.8',
  items: [
    { key: 'aceite', label: 'Aceite y filtro', every_km: 5000, every_months: 4, severity: 'severo', category_slug: 'filtros', service_slug: 'cambio-aceite' },
    { key: 'aire', label: 'Filtro de aire', every_km: 15000, every_months: 12, severity: 'severo', category_slug: 'filtros', service_slug: null },
    { key: 'frenos', label: 'Pastillas de freno', every_km: 30000, every_months: null, severity: 'normal', category_slug: null, service_slug: null },
    { key: 'liquido', label: 'Líquido de frenos', every_km: null, every_months: 24, severity: 'normal', category_slug: null, service_slug: null },
  ],
};
const reset = () => {
  secrets = { ANTHROPIC_API_KEY: 'sk-ant-falsa', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  db = { settings: {}, vehicles: [{ make_id: 1, model_id: 100, year: 2016 }], existing: null, rate: 0, saved: [], saveId: 42 };
  ai = () => structuredClone(GOOD);
  calls = [];
};
const call = (body, headers = { Authorization: 'Bearer token-usuario' }) =>
  handler(new Request('https://p.supabase.co/functions/v1/ai-maintenance-template', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://xautohubrd.com', ...headers }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, reply: await r.json() }));
const anthropic = () => calls.filter((c) => c.url.startsWith('https://api.anthropic.com/'));

console.log('\nAcceso');
reset();
check('sin sesión: 403', (await call({ profile_vehicle_id: 1 }, {})).status === 403);
check('con un token inválido: 403', (await call({ profile_vehicle_id: 1 }, { Authorization: 'Bearer malo' })).status === 403);
check('un id inválido: 400', (await call({ profile_vehicle_id: 'x' })).status === 400);
check('y no se llamó a Anthropic', anthropic().length === 0);
reset(); db.vehicles = [];
check('un vehículo que no es suyo (RLS devuelve vacío): 404 y sin IA', (await call({ profile_vehicle_id: 9 })).status === 404 && anthropic().length === 0);
reset();
await call({ profile_vehicle_id: 1 });
check('el vehículo se lee con la sesión de la persona (no con la service_role)', calls.find((c) => c.url.includes('profile_vehicles?')).asUser === 'Bearer token-usuario');
reset(); db.vehicles[0].model_id = null;
check('un modelo escrito a mano (sin id) no se puede: pide elegirlo de la lista', (await call({ profile_vehicle_id: 1 })).reply.code === 'sin_modelo');

console.log('\nLa guía');
reset();
let r = await call({ profile_vehicle_id: 1 });
const saved = db.saved[0];
check('guarda la guía por SQL (que valida los slugs) y responde su id', r.reply.ok && r.reply.data.template_id === 42 && r.reply.data.created === true && db.saved.length === 1);
check('el rango incluye el año del vehículo (2016 entre 2014 y 2019)', saved.p_year_from <= 2016 && saved.p_year_to >= 2016);
check('guarda los 4 renglones con sus intervalos', saved.p_items.length === 4 && saved.p_items[0].every_km === 5000 && saved.p_items[3].every_months === 24);
check('el modelo rápido (Haiku) alcanza para esto', anthropic()[0].parsed.model === 'claude-haiku-4-5-20251001');
check('el sistema pide intervalo severo para RD y prohíbe torques y capacidades', /SERVICIO SEVERO/.test(anthropic()[0].parsed.system) && /PROHIBIDO: torques, capacidades/.test(anthropic()[0].parsed.system));
check('la IA recibe las categorías y los servicios reales', /filtros = Filtros/.test(anthropic()[0].parsed.messages[0].content.at(-1).text) && /cambio-aceite/.test(anthropic()[0].parsed.messages[0].content.at(-1).text));

console.log('\nCaché para todos');
reset(); db.existing = 17;
r = await call({ profile_vehicle_id: 1 });
check('si ya hay una guía que cubra el año, la devuelve y NO llama a la IA', r.reply.data.template_id === 17 && r.reply.data.created === false && anthropic().length === 0);
reset();
for (let i = 0; i < 7; i++) r = await call({ profile_vehicle_id: 1 });
check('más de 6 guías por hora por persona se corta (429)', r.status === 429);

console.log('\nValidación de lo que dice la IA');
reset();
ai = () => ({ ...GOOD, items: [
  ...GOOD.items,
  { key: 'torque', label: 'Apretar tuercas a 120 Nm', every_km: 10000, every_months: null, severity: 'normal' },
  { key: 'capacidad', label: 'Aceite 4.5 litros', every_km: 5000, every_months: null, severity: 'normal' },
  { key: 'psi', label: 'Presión a 32 psi', every_km: 5000, every_months: null, severity: 'normal' },
  { key: 'visc', label: 'Aceite viscosidad 5W-30', every_km: 5000, every_months: null, severity: 'normal' },
  { key: 'raro', label: 'Cada mil años', every_km: 9999999, every_months: 9999, severity: 'normal' },
  { key: 'sin', label: 'Sin intervalo', every_km: null, every_months: null, severity: 'normal' },
  { key: 'aceite', label: 'Aceite repetido', every_km: 5000, every_months: null, severity: 'normal' },
] });
await call({ profile_vehicle_id: 1 });
const keys = db.saved[0].p_items.map((i) => i.key);
check('los renglones con torques, capacidades, presiones o viscosidades se descartan', !['torque', 'capacidad', 'psi', 'visc'].some((k) => keys.includes(k)));
check('un intervalo absurdo y uno sin intervalo se descartan', !keys.includes('raro') && !keys.includes('sin'));
check('una clave repetida se descarta (queda la primera)', keys.filter((k) => k === 'aceite').length === 1 && db.saved[0].p_items[0].label === 'Aceite y filtro');
check('quedan solo los 4 buenos', keys.length === 4);
reset();
ai = () => ({ ...GOOD, year_from: 1990, year_to: 2030 });
await call({ profile_vehicle_id: 1 });
check('un rango de años exagerado se acota alrededor del año del vehículo', db.saved[0].p_year_to - db.saved[0].p_year_from <= 12 && db.saved[0].p_year_from <= 2016 && db.saved[0].p_year_to >= 2016);
reset();
ai = () => ({ ...GOOD, year_from: 2018, year_to: 2019 });
await call({ profile_vehicle_id: 1 });
check('si la IA da un rango que no incluye el año, se extiende para incluirlo', db.saved[0].p_year_from <= 2016 && db.saved[0].p_year_to >= 2019);
reset();
ai = () => ({ ...GOOD, items: GOOD.items.slice(0, 2) });
r = await call({ profile_vehicle_id: 1 });
check('con menos de 3 renglones buenos no se guarda una guía pobre', r.reply.code === 'ia_no_disponible' && db.saved.length === 0);

console.log('\nFallos');
reset(); ai = () => 500;
r = await call({ profile_vehicle_id: 1 });
check('con la IA caída: ia_no_disponible y no se guarda nada', r.reply.code === 'ia_no_disponible' && db.saved.length === 0);
reset(); db.settings.ai_feature_maintenance = false;
r = await call({ profile_vehicle_id: 1 });
check('con el interruptor apagado: sin llamadas', r.reply.code === 'ia_no_disponible' && anthropic().length === 0);
reset(); db.saveId = null;
r = await call({ profile_vehicle_id: 1 });
check('si la base no guarda (por ejemplo un modelo que no es de la marca): ia_no_disponible', r.reply.code === 'ia_no_disponible');

console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} comprobaciones fallaron.`);
process.exit(failed === 0 ? 0 : 1);
