// Prueba el handler de supabase/functions/ai-product-ingest/index.ts sin Deno, sin Supabase y sin Anthropic:
//
//   node scripts/verify-ai-ingest.mjs
//
// Le pone un `Deno` y un `fetch` de mentira (la base, el almacenamiento y Anthropic) y recorre lo que importa: que solo un
// admin la llame, que la IA nunca invente ids (categoría, marca, modelo), que precio y cantidad solo salgan si están
// impresos, que una compatibilidad "de conocimiento general" no salga marcada, que un duplicado se anote, que una lista
// produzca un borrador por renglón, que la misma foto no se pague dos veces y que un fallo deje el borrador en `failed`
// sin crear nada.

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

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-ingest-')), 'handler.mjs');
await build({ entryPoints: ['supabase/functions/ai-product-ingest/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });

const ADMIN = '11111111-1111-4111-8111-111111111111';
const D1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const D2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
const JPEG_B = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9, 9, 9, 9, 9]);

let secrets;
let db;
let anthropic; // { read, write, group } cada uno una función (body) => respuesta
let calls;
let background;

globalThis.Deno = { env: { get: (k) => secrets[k] }, serve: (h) => { globalThis.__handler = h; } };
globalThis.EdgeRuntime = { waitUntil: (p) => { background.push(p); } };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const method = init.method ?? 'GET';

  if (url.startsWith('https://api.anthropic.com/')) {
    const body = JSON.parse(init.body);
    const kind = body.system.includes('Lees fotos') ? 'read' : body.system.includes('Redactas la ficha') ? 'write' : 'group';
    calls[calls.length - 1].kind = kind;
    calls[calls.length - 1].parsed = body;
    const text = anthropic[kind](body);
    if (typeof text === 'number') return new Response('', { status: text });
    return json({ content: [{ type: 'text', text: JSON.stringify(text) }], usage: { input_tokens: 2000, output_tokens: 400 } });
  }
  if (url.endsWith('/rest/v1/rpc/is_admin')) return json(init.headers.Authorization === 'Bearer token-admin');
  if (url.endsWith('/auth/v1/user')) return json({ id: ADMIN });
  if (url.includes('/rest/v1/site_settings')) {
    const key = decodeURIComponent(url.split('key=eq.')[1]?.split('&')[0] ?? '');
    return json(key in db.settings ? [{ value: db.settings[key] }] : []);
  }
  if (url.endsWith('/rest/v1/rpc/ai_budget_status')) return json([{ tier: 'ok', pct: 1, public_ok: true }]);
  if (url.endsWith('/rest/v1/rpc/ai_find_duplicate_product')) { db.dupArgs.push(JSON.parse(init.body)); return json(db.duplicate); }
  if (url.endsWith('/rest/v1/ai_usage')) { db.usage.push(JSON.parse(init.body)); return new Response('', { status: 201 }); }
  if (url.includes('/rest/v1/ai_query_cache') && method === 'GET') {
    const key = decodeURIComponent(url.split('key=eq.')[1]?.split('&')[0] ?? '');
    return json(key in db.cache ? [{ value: db.cache[key] }] : []);
  }
  if (url.includes('/rest/v1/ai_query_cache') && method === 'POST') { const b = JSON.parse(init.body); db.cache[b.key] = b.value; return new Response('', { status: 201 }); }
  if (url.includes('/rest/v1/product_categories')) return json(db.categories);
  if (url.includes('/rest/v1/vehicle_makes')) return json(db.makes);
  if (url.includes('/rest/v1/vehicle_models')) return json(db.models);
  if (url.includes('/rest/v1/hub_parts')) return json(db.examples);
  if (url.includes('/storage/v1/object/ai-product-sources/')) {
    const file = decodeURIComponent(url.split('/ai-product-sources/')[1]);
    return file in db.files ? new Response(db.files[file]) : new Response('', { status: 404 });
  }
  if (url.includes('/rest/v1/ai_product_drafts') && method === 'GET') {
    const ids = decodeURIComponent(url.split('id=in.(')[1]?.split(')')[0] ?? '').split(',');
    return json(db.drafts.filter((d) => ids.includes(d.id) && ['queued', 'failed'].includes(d.status)));
  }
  if (url.includes('/rest/v1/ai_product_drafts') && method === 'PATCH') {
    const id = url.split('id=eq.')[1];
    Object.assign(db.drafts.find((d) => d.id === id), JSON.parse(init.body));
    return new Response(null, { status: 204 });
  }
  if (url.includes('/rest/v1/ai_product_drafts') && method === 'POST') {
    db.drafts.push({ id: `nuevo-${db.drafts.length}`, ...JSON.parse(init.body) });
    return new Response('', { status: 201 });
  }
  return json([], 404);
};

await import(pathToFileURL(out).href);
const handler = globalThis.__handler;

const reset = () => {
  secrets = { ANTHROPIC_API_KEY: 'sk-ant-falsa', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  db = {
    settings: {}, usage: [], cache: {}, dupArgs: [], duplicate: null, examples: [{ name: 'Pastillas de freno Brembo', short_description: 'Frenado firme.', specs: { Material: 'Cerámica' } }],
    categories: [{ id: 10, name: 'Frenos', parent_id: null }, { id: 11, name: 'Pastillas', parent_id: 10 }],
    makes: [{ id: 1, name: 'Toyota' }, { id: 2, name: 'Honda' }],
    models: [{ id: 100, make_id: 1, name: 'Corolla' }, { id: 101, make_id: 1, name: 'Camry' }, { id: 200, make_id: 2, name: 'Civic' }],
    files: { [`${ADMIN}/lote/frente.jpg`]: JPEG, [`${ADMIN}/lote/etiqueta.jpg`]: JPEG_B },
    drafts: [{ id: D1, created_by: ADMIN, source_kind: 'article', source_paths: [`${ADMIN}/lote/frente.jpg`, `${ADMIN}/lote/etiqueta.jpg`], batch_id: null, hint: null, status: 'queued' }],
  };
  anthropic = {
    read: () => ({ readable: true, items: [ITEM] }),
    write: () => ({ name: 'Pastillas de freno delanteras Toyota', short_description: 'Frenado seguro.', description: 'Pastillas para el Corolla.', specs: [{ key: 'Material', value: 'Cerámica' }], aliases: ['balatas'] }),
    group: () => ({ groups: [{ indices: [0, 1] }, { indices: [1, 2] }] }),
  };
  calls = [];
  background = [];
};

const ITEM = {
  brand: 'Toyota', brand_conf: 'alta', name_guess: 'Pastillas de freno', part_type: 'pastillas de freno',
  part_number: '04465-02220', part_number_conf: 'alta', part_number_source: 'etiqueta',
  cross_refs: [{ value: 'C-110', printed: true }, { value: 'GDB3469', printed: false }],
  category_id: 11, category_proposal: null, category_conf: 'alta', universal: false,
  compat: [
    { make: 'Toyota', model: 'Corolla', year_from: 2014, year_to: 2018, printed: true },
    { make: 'toyota', model: 'Camry', year_from: 2012, year_to: null, printed: false },
    { make: 'Mazda', model: '3', year_from: 2015, year_to: null, printed: true },
    { make: 'Honda', model: 'Civic Type R', year_from: null, year_to: null, printed: true },
  ],
  condition: 'nuevo', weight_kg: null, dimensions: null, price_printed: null, quantity_printed: null,
  main_photo: 0, photo_order: [0, 1, 7], photo_alt: ['Frente de las pastillas', 'Etiqueta con el número de parte'],
};

const call = async (body, token = 'token-admin') => {
  const res = await handler(new Request('https://p.supabase.co/functions/v1/ai-product-ingest', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: 'https://xautohubrd.com' }, body: JSON.stringify(body),
  }));
  const reply = await res.json();
  await Promise.all(background);
  return { status: res.status, reply };
};
const anthropicCalls = (kind) => calls.filter((c) => c.kind === kind);

// --- Quién puede ------------------------------------------------------------------------
console.log('\nAcceso');
reset();
check('sin sesión: 403', (await call({ action: 'process', draft_ids: [D1] }, '')).status === 403);
check('un usuario que no es admin: 403', (await call({ action: 'process', draft_ids: [D1] }, 'token-comun')).status === 403);
check('y no se llamó a Anthropic', anthropicCalls('read').length === 0);
check('una acción desconocida: 400', (await call({ action: 'borrar' })).status === 400);
check('ids que no son uuid: 400', (await call({ action: 'process', draft_ids: ['uno'] })).status === 400);
check('más de 30 borradores: 400', (await call({ action: 'process', draft_ids: Array(31).fill(D1) })).status === 400);

// --- Un artículo ---------------------------------------------------------------------------
console.log('\nLectura de un artículo');
reset();
let r = await call({ action: 'process', draft_ids: [D1] });
const d = db.drafts[0];
check('responde 202 con lo encolado (el trabajo sigue en segundo plano)', r.status === 202 && r.reply.data.queued === 1);
check('el borrador queda listo', d.status === 'ready' && d.error === null);
check('la lectura visual usa el modelo smart y la redacción el rápido', JSON.parse(anthropicCalls('read')[0].init.body).model === 'claude-sonnet-5' && JSON.parse(anthropicCalls('write')[0].init.body).model === 'claude-haiku-4-5-20251001');
check('las fotos viajan como imágenes base64 (no como rutas ni como URLs)', anthropicCalls('read')[0].parsed.messages[0].content.filter((b) => b.type === 'image').length === 2);
check('la IA recibe la lista real de categorías', anthropicCalls('read')[0].parsed.system.includes('11=Frenos > Pastillas'));
check('y la de marcas y modelos', anthropicCalls('read')[0].parsed.system.includes('Toyota: Camry, Corolla') || anthropicCalls('read')[0].parsed.system.includes('Toyota: Corolla, Camry'));
check('la redacción recibe ejemplos de productos de la misma categoría', anthropicCalls('write')[0].parsed.messages[0].content.at(-1).text.includes('Pastillas de freno Brembo'));
check('cada campo trae valor, confianza y fuente', d.fields.part_number.value === '04465-02220' && d.fields.part_number.confidence === 'alta' && d.fields.part_number.source === 'leído en etiqueta');
check('el nombre sale de la redacción, con la fuente "sugerido"', d.fields.name.value === 'Pastillas de freno delanteras Toyota' && d.fields.name.source === 'sugerido');
check('la categoría es de la lista', d.fields.category_id.value === 11);
check('solo las equivalencias IMPRESAS van en cross_refs', JSON.stringify(d.fields.cross_refs.value) === '["C-110"]');
check('las de conocimiento general quedan aparte, "sin verificar"', JSON.stringify(d.fields.cross_refs_unverified.value) === '["GDB3469"]' && d.fields.cross_refs_unverified.source === 'sin verificar');
check('el costo se anota (lectura + redacción)', d.cost_usd > 0 && db.usage.length === 2);

// --- Nunca inventa ids ----------------------------------------------------------------------
console.log('\nLa IA no inventa ids');
const fit = d.fields.fitments.value;
check('Toyota Corolla 2014-2018 se resuelve contra la base (ids reales)', fit.some((f) => f.make_id === 1 && f.model_id === 100 && f.year_from === 2014 && f.year_to === 2018));
check('la compatibilidad impresa sale marcada', fit.find((f) => f.model_id === 100).selected === true);
check('la de conocimiento general sale desmarcada y "verificar"', fit.find((f) => f.model_id === 101).selected === false && fit.find((f) => f.model_id === 101).verify === true);
check('una marca que no existe va a unmatched (no se descarta)', d.unmatched.some((u) => u.text.includes('Mazda')));
check('un modelo que no existe de una marca real también', d.unmatched.some((u) => u.text.includes('Civic Type R')));
check('nada de lo no resuelto entra a fitments', fit.length === 2);
check('el orden de fotos descarta índices fuera de rango', JSON.stringify(d.fields.photo_order.value) === '[0,1]');
reset();
anthropic.read = () => ({ readable: true, items: [{ ...ITEM, category_id: 9999, category_proposal: 'Sensores' }] });
await call({ action: 'process', draft_ids: [D1] });
check('una categoría inventada se anula y queda la propuesta de texto', db.drafts[0].fields.category_id.value === null && db.drafts[0].fields.category_proposal.value === 'Sensores');

// --- Precio y cantidad ----------------------------------------------------------------------------
console.log('\nPrecio y cantidad nunca se inventan');
reset();
await call({ action: 'process', draft_ids: [D1] });
check('sin precio impreso: vacío y marcado "falta"', db.drafts[0].fields.price.value === null && db.drafts[0].fields.price.source === 'falta');
check('sin cantidad impresa: vacío y marcado "falta"', db.drafts[0].fields.stock.value === null && db.drafts[0].fields.stock.source === 'falta');
reset();
anthropic.read = () => ({ readable: true, items: [{ ...ITEM, price_printed: 1850, quantity_printed: 12 }] });
await call({ action: 'process', draft_ids: [D1] });
check('con precio y cantidad impresos se rellenan', db.drafts[0].fields.price.value === 1850 && db.drafts[0].fields.stock.value === 12);
check('y dicen de dónde salieron', db.drafts[0].fields.price.source === 'leído en la factura');

// --- Duplicados y caché ----------------------------------------------------------------------------
console.log('\nDuplicados y caché');
reset();
db.duplicate = 123;
await call({ action: 'process', draft_ids: [D1] });
check('un duplicado se anota y no está confirmado', db.drafts[0].duplicate_of === 123 && db.drafts[0].duplicate_confirmed === false);
check('se busca por número de parte, marca y nombre', db.dupArgs[0].p_part === '04465-02220' && db.dupArgs[0].p_brand === 'Toyota' && db.dupArgs[0].p_name.includes('Pastillas'));
reset();
await call({ action: 'process', draft_ids: [D1] });
db.drafts[0].status = 'queued';
const before = anthropicCalls('read').length;
await call({ action: 'process', draft_ids: [D1] });
check('la misma foto no se paga dos veces (caché por hash de las imágenes)', anthropicCalls('read').length === before);
check('y el borrador se rehace igual', db.drafts[0].status === 'ready');
db.drafts[0].status = 'failed';
db.drafts[0].hint = 'es de la marca Brembo';
await call({ action: 'process', draft_ids: [D1] });
check('con otra pista sí se vuelve a leer', anthropicCalls('read').length === before + 1);
const hintText = anthropicCalls('read').at(-1).parsed.messages[0].content.at(-1).text;
check('la pista del admin va como dato, dentro de <datos>', hintText.includes('<datos>') && hintText.includes('es de la marca Brembo'));

// --- Listas ---------------------------------------------------------------------------------------
console.log('\nLista de proveedor');
reset();
db.drafts[0].source_kind = 'list';
db.drafts[0].batch_id = 'lote-1';
anthropic.read = () => ({ readable: true, items: [ITEM, { ...ITEM, name_guess: 'Filtro de aceite', part_number: 'W67/2', price_printed: 450, quantity_printed: 20, category_id: 10, compat: [] }, { ...ITEM, name_guess: 'Bujía', part_number: 'BKR6E', compat: [] }] });
await call({ action: 'process', draft_ids: [D1] });
check('un borrador por renglón', db.drafts.length === 3);
check('el primero actualiza el original y los demás se crean nuevos', db.drafts[0].id === D1 && db.drafts[1].id.startsWith('nuevo-'));
check('los nuevos comparten las fotos de origen y el lote', db.drafts[1].source_paths.length === 2 && db.drafts[1].batch_id === 'lote-1' && db.drafts[1].created_by === ADMIN);
check('cada uno trae su precio impreso', db.drafts[1].fields.price.value === 450 && db.drafts[2].fields.price.value === null);
check('la lectura visual se paga una sola vez', anthropicCalls('read').length === 1);
reset();
anthropic.read = () => ({ readable: true, items: [ITEM, { ...ITEM, name_guess: 'Otro' }] });
await call({ action: 'process', draft_ids: [D1] });
check('un artículo de fotos produce un solo borrador aunque la IA devuelva más', db.drafts.length === 1);

// --- Fallos -----------------------------------------------------------------------------------------
console.log('\nFallos');
reset();
anthropic.read = () => ({ readable: false, reason: 'Las fotos muestran un paisaje.', items: [] });
await call({ action: 'process', draft_ids: [D1] });
check('fotos que no son una pieza: failed con la razón en lenguaje llano', db.drafts[0].status === 'failed' && db.drafts[0].error === 'Las fotos muestran un paisaje.');
reset();
anthropic.read = () => 500;
await call({ action: 'process', draft_ids: [D1] });
check('Anthropic caído: failed, sin campos inventados', db.drafts[0].status === 'failed' && Object.keys(db.drafts[0].fields ?? {}).length === 0);
reset();
anthropic.write = () => 500;
await call({ action: 'process', draft_ids: [D1] });
check('si falla solo la redacción, el borrador sale igual con lo que se leyó (nombre "baja")', db.drafts[0].status === 'ready' && db.drafts[0].fields.name.confidence === 'baja' && db.drafts[0].fields.description.value === null);
reset();
db.files = {};
await call({ action: 'process', draft_ids: [D1] });
check('fotos que no se pueden abrir: failed, sin llamar a la IA', db.drafts[0].status === 'failed' && anthropicCalls('read').length === 0);
reset();
db.settings.ai_feature_catalog_ingest = false;
await call({ action: 'process', draft_ids: [D1] });
check('con el interruptor del catálogo apagado: failed y sin llamadas', db.drafts[0].status === 'failed' && anthropicCalls('read').length === 0);
reset();
db.settings.ai_enabled = false;
await call({ action: 'process', draft_ids: [D1] });
check('con la IA apagada: failed y sin llamadas', db.drafts[0].status === 'failed' && anthropicCalls('read').length === 0);
reset();
db.drafts[0].status = 'approved';
r = await call({ action: 'process', draft_ids: [D1] });
check('un borrador ya aprobado no se vuelve a procesar', r.reply.data.queued === 0 && anthropicCalls('read').length === 0);

// --- Agrupar --------------------------------------------------------------------------------------
console.log('\nAgrupar un lote');
reset();
const paths = [`${ADMIN}/lote/a.jpg`, `${ADMIN}/lote/b.jpg`, `${ADMIN}/lote/c.jpg`, `${ADMIN}/lote/d.jpg`];
db.files = Object.fromEntries(paths.map((p) => [p, JPEG]));
anthropic.group = () => ({ groups: [{ indices: [0, 1] }, { indices: [1, 2, 9] }] });
r = await call({ action: 'group', paths });
check('responde los grupos', r.status === 200 && Array.isArray(r.reply.data.groups));
check('cada foto va en un solo grupo (la repetida y la fuera de rango se descartan)', JSON.stringify(r.reply.data.groups) === '[[0,1],[2],[3]]', JSON.stringify(r.reply.data.groups));
check('agrupar no escribe nada en la base', db.drafts.length === 1);
r = await call({ action: 'group', paths: [`${'22222222-2222-4222-8222-222222222222'}/lote/a.jpg`] });
check('rutas de la carpeta de otra persona: 400', r.status === 400);
r = await call({ action: 'group', paths: Array.from({ length: 31 }, (_, i) => `${ADMIN}/lote/${i}.jpg`) });
check('más de 30 fotos: 400', r.status === 400);

// --- Pedir otra lectura ---------------------------------------------------------------------------------
console.log('\nPedir otra lectura');
reset();
await call({ action: 'process', draft_ids: [D1] });
const priorReads = anthropicCalls('read').length;
r = await call({ action: 'reread', draft_id: D1, hint: 'El número de parte está en la caja, no en la pieza' });
check('vuelve a procesar el mismo borrador con la pista', r.reply.data.queued === 1 && db.drafts[0].hint.startsWith('El número') && anthropicCalls('read').length === priorReads + 1);
check('y queda listo otra vez', db.drafts[0].status === 'ready');

console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} comprobaciones fallaron.`);
process.exit(failed === 0 ? 0 : 1);
