// Prueba las edges maps-autocomplete, maps-geocode y ai-normalize-address sin Deno, sin Supabase, sin Google y sin Anthropic:
//
//   node scripts/verify-ai-maps.mjs
//
// Las tres son públicas: límite por IP, caché, gasto de Google a `ai_usage` (feature maps_*), tope propio de Maps (`gate(..., 'maps')`),
// y cualquier fallo es `ia_no_disponible`. La IA solo interpreta texto: la provincia tiene que ser una de las 32 y nunca bloquea un pedido.

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-maps-'));
const bundle = async (name) => {
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [`supabase/functions/${name}/index.ts`], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  await import(pathToFileURL(outfile).href);
  return globalThis.__handler;
};

let secrets, db, ai, places, geo, calls;
globalThis.Deno = { env: { get: (k) => secrets[k] }, serve: (h) => { globalThis.__handler = h; } };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  const method = init.method ?? 'GET';
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.startsWith('https://api.anthropic.com/')) {
    const r = ai();
    return typeof r === 'number' ? new Response('', { status: r }) : json({ content: [{ type: 'text', text: JSON.stringify(r) }], usage: { input_tokens: 400, output_tokens: 60 } });
  }
  if (url.startsWith('https://places.googleapis.com/')) {
    calls[calls.length - 1].parsed = JSON.parse(init.body);
    const r = places();
    return typeof r === 'number' ? new Response('', { status: r }) : json(r);
  }
  if (url.startsWith('https://maps.googleapis.com/maps/api/geocode/json')) return json(geo());
  if (url.includes('/rest/v1/site_settings')) { const key = decodeURIComponent(url.split('key=eq.')[1]?.split('&')[0] ?? ''); return json(key in db.settings ? [{ value: db.settings[key] }] : []); }
  if (url.endsWith('/rest/v1/rpc/ai_budget_status')) { db.budgetKinds.push(JSON.parse(init.body).p_kind); return json([db.budget]); }
  if (url.endsWith('/rest/v1/rpc/ai_rate_check')) { const { p_key, p_max } = JSON.parse(init.body); db.rate[p_key] = (db.rate[p_key] ?? 0) + 1; return json(db.rate[p_key] <= p_max); }
  if (url.endsWith('/rest/v1/ai_usage')) { db.usage.push(JSON.parse(init.body)); return new Response('', { status: 201 }); }
  if (url.includes('/rest/v1/ai_query_cache') && method === 'GET') { const key = decodeURIComponent(url.split('key=eq.')[1]?.split('&')[0] ?? ''); return json(key in db.cache ? [{ value: db.cache[key] }] : []); }
  if (url.includes('/rest/v1/ai_query_cache') && method === 'POST') { const b = JSON.parse(init.body); db.cache[b.key] = b.value; return new Response('', { status: 201 }); }
  return json([], 404);
};

const geoOk = (over = {}) => ({
  status: 'OK',
  results: [{
    formatted_address: 'Av. Winston Churchill 1, Santo Domingo 10147, República Dominicana',
    place_id: 'ChIJabcdefghijk',
    geometry: { location: { lat: 18.4861, lng: -69.9312 }, location_type: 'ROOFTOP' },
    address_components: [
      { long_name: 'Piantini', short_name: 'Piantini', types: ['sublocality_level_1', 'sublocality'] },
      { long_name: 'Santo Domingo de Guzmán', short_name: 'SDG', types: ['administrative_area_level_2'] },
      { long_name: 'Distrito Nacional', short_name: 'DN', types: ['administrative_area_level_1'] },
      { long_name: 'República Dominicana', short_name: 'DO', types: ['country'] },
    ],
    ...over,
  }],
});

const reset = () => {
  secrets = { ANTHROPIC_API_KEY: 'sk-ant-falsa', GOOGLE_MAPS_API_KEY: 'AIza-falsa', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  db = { settings: {}, rate: {}, cache: {}, usage: [], budgetKinds: [], budget: { tier: 'ok', pct: 1, public_ok: true } };
  ai = () => ({ province: 'Santo Domingo', municipality: 'Los Alcarrizos', sector: 'Pantoja', reference: 'al lado del colmado Lalo', geocode_query: 'Pantoja, Los Alcarrizos, Santo Domingo' });
  places = () => ({ suggestions: [{ placePrediction: { placeId: 'ChIJabcdefghijk', text: { text: 'Av. Winston Churchill, Santo Domingo' } } }, { queryPrediction: { text: { text: 'ignorada' } } }] });
  geo = () => geoOk();
  calls = [];
};
const request = (handler, body, ip = '1.2.3.4') =>
  handler(new Request('https://p.supabase.co/functions/v1/x', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://xautohubrd.com', 'x-forwarded-for': ip }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, reply: await r.json() }));
const google = () => calls.filter((c) => c.url.includes('googleapis.com'));
const anthropic = () => calls.filter((c) => c.url.startsWith('https://api.anthropic.com/'));

const auto = await bundle('maps-autocomplete');
const geocode = await bundle('maps-geocode');
const normalize = await bundle('ai-normalize-address');
const UUID = '123e4567-e89b-42d3-a456-426614174000';

console.log('\nmaps-autocomplete');
reset();
let r = await request(auto, { query: 'winston chur', session_token: UUID });
check('devuelve sugerencias con su place_id y descarta lo que no es un lugar', r.reply.data.suggestions.length === 1 && r.reply.data.suggestions[0].place_id === 'ChIJabcdefghijk');
const g = google()[0];
check('pide solo RD, en español, con la clave de servidor en la cabecera (no en la URL)', g.parsed.includedRegionCodes[0] === 'do' && g.parsed.languageCode === 'es' && g.init.headers['X-Goog-Api-Key'] === 'AIza-falsa' && !g.url.includes('AIza'));
check('manda el token de sesión cuando es un uuid', g.parsed.sessionToken === UUID);
check('registra el gasto como maps_autocomplete', db.usage.some((u) => u.feature === 'maps_autocomplete' && u.cost_usd > 0 && u.ok));
check('consulta el tope de Maps y no el de la IA', db.budgetKinds.at(-1) === 'maps');
await request(auto, { query: 'Winston   CHUR' });
check('la misma búsqueda normalizada sale de la caché (no se paga dos veces)', google().length === 1);
check('menos de 3 letras: 400', (await request(auto, { query: 'ab' })).status === 400);
check('más de 100: 400', (await request(auto, { query: 'x'.repeat(101) })).status === 400);
reset();
await request(auto, { query: 'calle uno', session_token: 'no-es-uuid' });
check('un token que no es uuid no se reenvía', google()[0].parsed.sessionToken === undefined);
reset();
let ok = 0;
for (let i = 0; i < 45; i++) if ((await request(auto, { query: `calle numero ${i}` })).status === 200) ok++;
check('un visitante por encima de 40 por minuto se corta (429)', ok === 40);
reset(); db.budget = { tier: 'apagado', pct: 100, public_ok: false };
r = await request(auto, { query: 'winston churchill' });
check('con el tope de Maps alcanzado: ia_no_disponible y sin llamar a Google', r.reply.code === 'ia_no_disponible' && google().length === 0);
reset(); db.settings.ai_feature_address = false;
r = await request(auto, { query: 'winston churchill' });
check('con el interruptor apagado también', r.reply.code === 'ia_no_disponible' && google().length === 0);
reset(); places = () => 403;
r = await request(auto, { query: 'winston churchill' });
check('Google caído o clave rechazada: ia_no_disponible, y el fallo queda anotado', r.reply.code === 'ia_no_disponible' && db.usage.some((u) => u.feature === 'maps_autocomplete' && u.ok === false && u.error_code === 'http_403'));
reset(); delete secrets.GOOGLE_MAPS_API_KEY;
r = await request(auto, { query: 'winston churchill' });
check('sin clave configurada: ia_no_disponible (el formulario sigue a mano)', r.reply.code === 'ia_no_disponible' && google().length === 0);
reset(); places = () => ({ suggestions: [] });
await request(auto, { query: 'zzzzzz' });
await request(auto, { query: 'zzzzzz' });
check('una búsqueda sin resultados no se guarda en la caché', google().length === 2);

console.log('\nmaps-geocode');
reset();
r = await request(geocode, { place_id: 'ChIJabcdefghijk' });
const d = r.reply.data;
check('un place_id da coordenadas, provincia, municipio y sector', d.lat === 18.4861 && d.lng === -69.9312 && d.province === 'Distrito Nacional' && d.municipality === 'Santo Domingo de Guzmán' && d.sector === 'Piantini');
check('un punto de tejado es confianza alta y está en RD', d.confidence === 'alta' && d.in_do === true);
check('geocodifica con region=do e idioma es', /region=do/.test(google()[0].url) && /language=es/.test(google()[0].url));
check('registra el gasto como maps_geocode', db.usage.some((u) => u.feature === 'maps_geocode' && u.ok));
await request(geocode, { place_id: 'ChIJabcdefghijk' });
check('repetir lo mismo sale de la caché', google().length === 1);
reset();
await request(geocode, { address: 'Av. Winston Churchill, Santo Domingo' });
check('una dirección escrita se limita a RD (components=country:DO)', /components=country%3ADO/.test(google()[0].url));
reset();
await request(geocode, { lat: 18.48612, lng: -69.93121 });
check('la inversa usa latlng', /latlng=18\.48612%2C-69\.93121/.test(google()[0].url));
await request(geocode, { lat: 18.48649, lng: -69.93149 });
check('dos pines a pocos metros comparten resultado (caché redondeada)', google().length === 1);
reset();
geo = () => geoOk({ address_components: [{ long_name: 'Miami', short_name: 'Miami', types: ['locality'] }, { long_name: 'Estados Unidos', short_name: 'US', types: ['country'] }], geometry: { location: { lat: 25.76, lng: -80.19 }, location_type: 'APPROXIMATE' } });
r = await request(geocode, { address: 'Miami' });
check('un lugar fuera de RD llega con in_do: false', r.reply.data.in_do === false && r.reply.data.province === null);
reset(); geo = () => ({ status: 'ZERO_RESULTS', results: [] });
r = await request(geocode, { address: 'asdfghjkl' });
check('sin resultados: found false (no es un error)', r.reply.ok === true && r.reply.data.found === false && db.usage.every((u) => u.ok));
reset(); geo = () => ({ status: 'REQUEST_DENIED' });
r = await request(geocode, { address: 'Calle Uno' });
check('clave rechazada por Google: se anota el fallo, y found false', r.reply.data.found === false && db.usage.some((u) => u.ok === false && /REQUEST_DENIED/.test(u.error_code)));
reset();
check('sin ningún dato de entrada: 400', (await request(geocode, {})).status === 400);
check('un place_id con caracteres raros: 400', (await request(geocode, { place_id: '../../etc' })).status === 400);
check('coordenadas fuera de rango: 400', (await request(geocode, { lat: 400, lng: 1 })).status === 400);
reset();
ok = 0;
for (let i = 0; i < 24; i++) if ((await request(geocode, { address: `calle ${i} numero` })).status === 200) ok++;
check('un visitante por encima de 20 por minuto se corta (429)', ok === 20);
reset(); db.budget = { tier: 'apagado', pct: 100, public_ok: false };
r = await request(geocode, { address: 'Calle Uno' });
check('con el tope alcanzado: ia_no_disponible y sin llamar a Google', r.reply.code === 'ia_no_disponible' && google().length === 0);

console.log('\nai-normalize-address');
reset();
r = await request(normalize, { text: 'Pantoja, al lado del colmado Lalo, Los Alcarrizos' });
const n = r.reply.data;
check('extrae provincia, municipio, sector y la referencia informal', n.province === 'Santo Domingo' && n.municipality === 'Los Alcarrizos' && n.sector === 'Pantoja' && n.reference === 'al lado del colmado Lalo');
check('geocodifica con la consulta limpia, sin la referencia', /address=Pantoja/.test(google()[0].url) && !/colmado/.test(google()[0].url));
check('una dirección informal nunca pasa de confianza media', n.geo_confidence === 'media' && n.lat === 18.4861);
check('usa el modelo rápido y manda el texto como dato', anthropic()[0].init.body.includes('claude-haiku-4-5-20251001') && /<datos>/.test(anthropic()[0].init.body));
reset();
ai = () => ({ province: 'Narnia', municipality: null, sector: null, reference: null, geocode_query: null });
geo = () => ({ status: 'ZERO_RESULTS', results: [] });
r = await request(normalize, { text: 'por ahi cerca del rio, no se mas' });
check('una provincia inventada se descarta (la IA no inventa lugares)', r.reply.data.province === null);
check('sin coordenadas la confianza es baja y el pedido sigue (ok: true)', r.reply.ok === true && r.reply.data.lat === null && r.reply.data.geo_confidence === 'baja');
reset();
geo = () => geoOk({ address_components: [{ long_name: 'Miami', short_name: 'Miami', types: ['locality'] }, { long_name: 'Estados Unidos', short_name: 'US', types: ['country'] }] });
r = await request(normalize, { text: 'Calle falsa 123, Miami' });
check('si Google la ubica fuera de RD, no se guardan coordenadas', r.reply.data.lat === null && r.reply.data.place_id === null && r.reply.data.geo_confidence === 'baja');
reset();
ai = () => ({ province: 'santo domingo', municipality: '<b>Los Alcarrizos</b>', sector: null, reference: null, geocode_query: null });
r = await request(normalize, { text: 'Los Alcarrizos, casa azul' });
check('la provincia se reconoce sin importar mayúsculas o tildes, y el HTML se limpia', r.reply.data.province === 'Santo Domingo' && r.reply.data.municipality === 'Los Alcarrizos');
check('con sector y municipio sin consulta, igual se arma una para geocodificar', google().length === 1);
reset();
await request(normalize, { text: 'Calle 3 casa 4, llámame al 809-953-9782 o maria@correo.com' });
check('el texto va sin teléfono ni correo', !/953-9782|maria@correo/.test(anthropic()[0].init.body));
check('menos de 5 caracteres: 400', (await request(normalize, { text: 'abc' })).status === 400);
check('más de 200: 400', (await request(normalize, { text: 'x'.repeat(201) })).status === 400);
reset(); ai = () => 500;
r = await request(normalize, { text: 'Calle 3 casa 4, Santiago' });
check('Anthropic caído: ia_no_disponible (el checkout sigue con la dirección escrita)', r.reply.code === 'ia_no_disponible');
reset(); db.budget = { tier: 'sin_publico', pct: 91, public_ok: false };
r = await request(normalize, { text: 'Calle 3 casa 4, Santiago' });
check('al 90 % del tope de IA se apaga para visitantes', r.reply.code === 'ia_no_disponible' && anthropic().length === 0);
reset();
ok = 0;
for (let i = 0; i < 14; i++) if ((await request(normalize, { text: `Calle ${i} casa ${i}, Santiago` })).status === 200) ok++;
check('un visitante por encima de 10 por minuto se corta (429)', ok === 10);

console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} comprobaciones fallaron.`);
process.exit(failed === 0 ? 0 : 1);
