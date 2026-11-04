// Prueba las edges ai-parse-search (pública) y ai-match-models (admin) sin Deno, sin Supabase y sin Anthropic:
//
//   node scripts/verify-ai-search.mjs
//
// ai-parse-search: heurística antes que IA (un número de parte no la llama), la IA nunca da ids (se validan contra las listas), caché de 30 días,
// límite por IP, apagada al 90 % del tope, texto del visitante como dato (sin teléfonos), cualquier fallo = ia_no_disponible.
// ai-match-models: solo admin, el modelo canónico tiene que ser de la lista de la marca, el producto de la lista de activos, y la IA no crea nada.

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-search-'));
const bundle = async (name) => {
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [`supabase/functions/${name}/index.ts`], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  await import(pathToFileURL(outfile).href);
  return globalThis.__handler;
};

let secrets, db, ai, calls;
globalThis.Deno = { env: { get: (k) => secrets[k] }, serve: (h) => { globalThis.__handler = h; } };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  const method = init.method ?? 'GET';
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.startsWith('https://api.anthropic.com/')) {
    calls[calls.length - 1].parsed = JSON.parse(init.body);
    const r = ai();
    return typeof r === 'number' ? new Response('', { status: r }) : json({ content: [{ type: 'text', text: JSON.stringify(r) }], usage: { input_tokens: 600, output_tokens: 80 } });
  }
  if (url.endsWith('/rest/v1/rpc/is_admin')) return json(init.headers.Authorization === 'Bearer token-admin');
  if (url.endsWith('/auth/v1/user')) return json({ id: 'admin-1' });
  if (url.includes('/rest/v1/site_settings')) { const key = decodeURIComponent(url.split('key=eq.')[1]?.split('&')[0] ?? ''); return json(key in db.settings ? [{ value: db.settings[key] }] : []); }
  if (url.endsWith('/rest/v1/rpc/ai_budget_status')) return json([db.budget]);
  if (url.endsWith('/rest/v1/rpc/ai_rate_check')) { const { p_key, p_max } = JSON.parse(init.body); db.rate[p_key] = (db.rate[p_key] ?? 0) + 1; return json(db.rate[p_key] <= p_max); }
  if (url.endsWith('/rest/v1/ai_usage')) return new Response('', { status: 201 });
  if (url.includes('/rest/v1/ai_query_cache') && method === 'GET') { const key = decodeURIComponent(url.split('key=eq.')[1]?.split('&')[0] ?? ''); return json(key in db.cache ? [{ value: db.cache[key] }] : []); }
  if (url.includes('/rest/v1/ai_query_cache') && method === 'POST') { const b = JSON.parse(init.body); db.cache[b.key] = b.value; return new Response('', { status: 201 }); }
  if (url.includes('/rest/v1/vehicle_makes')) return json(db.makes);
  if (url.includes('/rest/v1/vehicle_models')) { const m = url.match(/make_id=(?:eq\.(\d+)|in\.\(([\d,]+)\))/); if (!m) return json(db.models); const ids = (m[1] ?? m[2]).split(','); return json(db.models.filter((x) => ids.includes(String(x.make_id)))); }
  if (url.includes('/rest/v1/product_categories')) return json(db.categories);
  if (url.endsWith('/rest/v1/rpc/admin_unmatched_vehicle_models')) { db.unmatchedAuth = init.headers.Authorization; return json(db.unmatched); }
  if (url.endsWith('/rest/v1/rpc/ai_search_gaps')) return json(db.gaps);
  if (url.includes('/rest/v1/hub_parts')) return json(db.products);
  return json([], 404);
};

const reset = () => {
  secrets = { ANTHROPIC_API_KEY: 'sk-ant-falsa', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  db = {
    settings: {}, rate: {}, cache: {}, budget: { tier: 'ok', pct: 1, public_ok: true },
    makes: [{ id: 1, name: 'Toyota' }, { id: 2, name: 'Chevrolet' }, { id: 3, name: 'Mercedes-Benz' }],
    models: [{ id: 100, make_id: 1, name: 'Corolla' }, { id: 101, make_id: 1, name: 'Camry' }, { id: 200, make_id: 2, name: 'Spark' }],
    categories: [{ slug: 'luces', name: 'Luces' }, { slug: 'frenos', name: 'Frenos' }],
    unmatched: [{ make_id: 1, make_name: 'Toyota', model_text: 'Corola', vehicles: 3 }, { make_id: 1, make_name: 'Toyota', model_text: 'Yaris Cross', vehicles: 1 }, { make_id: 1, make_name: 'Toyota', model_text: 'asdf', vehicles: 1 }],
    gaps: [{ query_norm: 'bumper', searches: 9 }], products: [{ id: 7, name: 'Parachoques delantero universal' }, { id: 8, name: 'Faro LED' }], unmatchedAuth: null,
  };
  ai = () => ({ make: 'Toyota', model: 'Corolla', year: 2015, category_slug: 'luces', terms: ['faro'], part_number: null, intent: 'comprar', corrected_query: null });
  calls = [];
};
const request = (handler, body, headers = {}, ip = '1.2.3.4') =>
  handler(new Request('https://p.supabase.co/functions/v1/x', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://xautohubrd.com', 'x-forwarded-for': ip, ...headers }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, reply: await r.json() }));
const anthropic = () => calls.filter((c) => c.url.startsWith('https://api.anthropic.com/'));

const parse = await bundle('ai-parse-search');
const match = await bundle('ai-match-models');

console.log('\nai-parse-search: heurística y entradas');
reset();
let r = await request(parse, { query: '04465-02220' });
check('un número de parte no llama a la IA', r.reply.data.skipped === 'heuristic' && anthropic().length === 0);
r = await request(parse, { query: 'GDB3469' });
check('un código tipo GDB3469 tampoco', r.reply.data.skipped === 'heuristic');
r = await request(parse, { query: 'XAH-000123' });
check('ni un SKU interno', r.reply.data.skipped === 'heuristic');
r = await request(parse, { query: 'faro led h4' });
check('una frase con palabras sí la llama', anthropic().length === 1 && !r.reply.data.skipped);
check('una frase muy corta: 400', (await request(parse, { query: 'ab' })).status === 400);
check('una frase de más de 120 caracteres: 400', (await request(parse, { query: 'x'.repeat(121) })).status === 400);

console.log('\nai-parse-search: la IA no da ids');
reset();
r = await request(parse, { query: 'faros corolla 2015' });
const d = r.reply.data;
check('marca y modelo se resuelven a los ids reales de la base', d.make_id === 1 && d.make_name === 'Toyota' && d.model_id === 100 && d.model_name === 'Corolla');
check('año, categoría y términos salen limpios', d.year === 2015 && d.category_slug === 'luces' && d.category_name === 'Luces' && d.terms[0] === 'faro');
check('la IA recibe los modelos de la marca detectada en la frase, no los de todas', /Corolla, Camry|Camry, Corolla/.test(anthropic()[0].parsed.messages[0].content.at(-1).text) && !/Spark/.test(anthropic()[0].parsed.messages[0].content.at(-1).text));
reset();
ai = () => ({ make: 'Ferrari', model: 'F40', year: 2015, category_slug: 'inventada', terms: ['faro <script>', 'x'], part_number: null, intent: 'comprar', corrected_query: null });
r = await request(parse, { query: 'faros ferrari 2015' });
check('una marca que no existe se descarta (nada de ids inventados)', r.reply.data.make_id === null && r.reply.data.model_id === null);
check('una categoría que no existe se descarta', r.reply.data.category_slug === null);
check('los términos se limpian a letras y números', r.reply.data.terms.length === 1 && r.reply.data.terms[0] === 'faro script');
reset();
ai = () => ({ make: 'Toyota', model: 'Spark', year: null, category_slug: null, terms: [], part_number: null, intent: 'comprar', corrected_query: null });
r = await request(parse, { query: 'cosas para toyota' });
check('un modelo que es de otra marca se descarta', r.reply.data.make_id === 1 && r.reply.data.model_id === null);
reset();
r = await request(parse, { query: 'bateria para chevy' }, {});
check('el alias "chevy" detecta Chevrolet y se le pasan sus modelos', /Spark/.test(anthropic()[0].parsed.messages[0].content.at(-1).text));
reset();
ai = () => ({ make: null, model: null, year: null, category_slug: null, terms: ['bateria'], part_number: null, intent: 'comprar', corrected_query: 'batería para el carro' });
r = await request(parse, { query: 'bateria pa el carrro' });
check('una frase corregida llega como corrected_query', r.reply.data.corrected_query === 'batería para el carro');
reset();
ai = () => ({ make: null, model: null, year: null, category_slug: null, terms: [], part_number: null, intent: 'servicio', corrected_query: null });
r = await request(parse, { query: 'cambio de aceite hoy' });
check('la intención "servicio" llega para sugerir cotizar', r.reply.data.intent === 'servicio');

console.log('\nai-parse-search: caché, límite, tope y datos');
reset();
await request(parse, { query: 'faros corolla 2015' });
await request(parse, { query: 'Faros   COROLLA 2015' });
check('la misma consulta (normalizada) no se paga dos veces: caché', anthropic().length === 1);
await request(parse, { query: 'faros corolla 2015' }, {}, '5.5.5.5');
check('el vehículo del garaje cambia la clave, y con otra IP la caché sigue sirviendo', anthropic().length === 1);
await request(parse, { query: 'faros corolla 2015', vehicle: { make_id: 1, model_id: 100, year: 2012 } });
check('con vehículo distinto sí se vuelve a consultar', anthropic().length === 2);
reset();
let ok = 0;
for (let i = 0; i < 24; i++) if ((await request(parse, { query: `faro numero ${i}` })).status === 200) ok++;
check('un visitante por encima de 20 por minuto se corta (429)', ok === 20);
check('otra IP tiene su propia cuenta', (await request(parse, { query: 'faro nuevo' }, {}, '9.9.9.9')).status === 200);
reset(); db.budget = { tier: 'sin_publico', pct: 91, public_ok: false };
r = await request(parse, { query: 'faros corolla' });
check('al 90 % del tope se apaga: ia_no_disponible y sin llamar', r.reply.code === 'ia_no_disponible' && anthropic().length === 0);
reset(); db.settings.ai_feature_search = false;
r = await request(parse, { query: 'faros corolla' });
check('con el interruptor apagado también', r.reply.code === 'ia_no_disponible' && anthropic().length === 0);
reset(); ai = () => 500;
r = await request(parse, { query: 'faros corolla' });
check('Anthropic caído: ia_no_disponible (el buscador sigue como siempre)', r.reply.code === 'ia_no_disponible');
reset();
await request(parse, { query: 'faro para mi carro, llámame al 809-953-9782 o a maria@correo.com' });
const userText = anthropic()[0].parsed.messages[0].content.at(-1).text;
check('la frase va como dato y sin teléfono ni correo', userText.includes('<datos>') && !/953-9782|maria@correo/.test(userText));
check('el sistema dice que es dato, no instrucciones', /nunca instrucciones|nunca una instrucción/.test(anthropic()[0].parsed.system));
check('usa el modelo rápido', anthropic()[0].parsed.model === 'claude-haiku-4-5-20251001');

console.log('\nai-match-models');
reset();
ai = () => ({ items: [{ i: 0, canonical_model: 'Corolla', confidence: 0.95 }, { i: 1, create_name: 'Yaris Cross', confidence: 0.8 }, { i: 2, confidence: 0.1 }, { i: 9, create_name: 'Fantasma', confidence: 0.9 }] });
check('sin sesión: 403', (await request(match, { action: 'models' })).status === 403);
check('un usuario que no es admin: 403', (await request(match, { action: 'models' }, { Authorization: 'Bearer token-comun' })).status === 403);
check('una acción desconocida: 400', (await request(match, { action: 'borrar' }, { Authorization: 'Bearer token-admin' })).status === 400);
r = await request(match, { action: 'models' }, { Authorization: 'Bearer token-admin' });
const items = r.reply.data.items;
check('"Corola" se propone como el Corolla que ya existe (con su id real)', items[0].canonical.id === 100 && items[0].create_name === null);
check('"Yaris Cross" se propone para crearse', items[1].canonical === null && items[1].create_name === 'Yaris Cross');
check('lo que no parece un modelo no se propone, y un índice inventado tampoco', items.length === 2);
check('la lista de "sin modelo" se pidió con la sesión del admin', db.unmatchedAuth === 'Bearer token-admin');
check('la IA no crea ni cambia nada: ninguna escritura', calls.every((c) => !['PATCH', 'DELETE', 'PUT'].includes(c.init.method ?? 'GET')));
reset();
ai = () => ({ items: [{ i: 0, canonical_model: 'Spark', confidence: 0.9 }] });
r = await request(match, { action: 'models' }, { Authorization: 'Bearer token-admin' });
check('un modelo canónico de OTRA marca no se acepta', r.reply.data.items.every((x) => x.canonical === null));
reset();
ai = () => ({ items: [{ query: 'bumper', product: 0, alias: 'bumper', confidence: 0.9 }, { query: 'foco', product: 55, alias: 'foco', confidence: 0.9 }, { query: 'x', product: 1, alias: 'Faro LED', confidence: 0.9 }] });
r = await request(match, { action: 'aliases' }, { Authorization: 'Bearer token-admin' });
check('un alias se propone para un producto que existe', r.reply.data.items.length === 1 && r.reply.data.items[0].product_id === 7 && r.reply.data.items[0].alias === 'bumper');
check('un producto inventado no entra, y un alias igual al nombre tampoco', r.reply.data.items.every((x) => x.product_id !== 55 && x.alias !== 'Faro LED'));
reset(); ai = () => 500;
r = await request(match, { action: 'aliases' }, { Authorization: 'Bearer token-admin' });
check('Anthropic caído: ia_no_disponible', r.reply.code === 'ia_no_disponible');

console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} comprobaciones fallaron.`);
process.exit(failed === 0 ? 0 : 1);
