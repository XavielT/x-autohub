// Prueba el handler de supabase/functions/build-status/index.ts sin Deno ni Vercel:
//
//   node scripts/verify-build-status.mjs
//
// Empaqueta la funcion con esbuild (ya viene con Angular), le pone un `Deno` y un `fetch` de
// mentira (la base y la API de Vercel), y recorre lo que importa: que solo un admin la llame,
// que sin token no falle, que el estado de Vercel se traduzca bien, que el token no salga en la
// respuesta y que un fallo de Vercel no le llegue al panel como un error.

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

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'build-status-')), 'handler.mjs');
await build({ entryPoints: ['supabase/functions/build-status/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });

const TOKEN = 'vercel-token-secreto';
const ENV = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  VERCEL_TOKEN: TOKEN,
  VERCEL_PROJECT_ID: 'prj_abc',
  VERCEL_TEAM_ID: 'team_xyz',
};

let env = { ...ENV };
let calls;
let vercel; // { status, body } | { throws: true }

globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { globalThis.__handler = h; } };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (url.endsWith('/rest/v1/rpc/is_admin')) return json(init.headers.Authorization === 'Bearer token-admin');
  if (url.startsWith('https://api.vercel.com/v6/deployments')) {
    if (vercel.throws) throw new Error('sin red');
    return json(vercel.body, vercel.status ?? 200);
  }
  throw new Error(`fetch inesperado: ${url}`);
};

await import(pathToFileURL(out).href);
const handler = globalThis.__handler;

function reset() {
  env = { ...ENV };
  calls = [];
  vercel = { body: { deployments: [{ uid: 'dpl_1', readyState: 'READY', created: Date.parse('2026-10-24T20:00:00Z'), ready: Date.parse('2026-10-24T20:01:10Z'), meta: { githubCommitMessage: 'Bump version to 2.13.0\n\ncuerpo' }, inspectorUrl: 'https://vercel.com/equipo/proyecto/abc' }] } };
}
const ask = async (token = 'token-admin', method = 'POST') => {
  const res = await handler(new Request('https://f.supabase.co/functions/v1/build-status', {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  }));
  const text = res.status === 204 ? '' : await res.text();
  return { status: res.status, text, body: text ? JSON.parse(text) : null };
};
const vercelCalls = () => calls.filter((c) => c.url.startsWith('https://api.vercel.com/'));

console.log('→ Quien puede llamarla');
reset();
check('OPTIONS responde para el navegador (CORS)', (await ask(null, 'OPTIONS')).status === 204);
check('un PUT no es valido', (await ask('token-admin', 'PUT')).status === 405);
let r = await ask('token-cliente');
check('un cliente (no admin) recibe 403 y no se le pregunta nada a Vercel', r.status === 403 && vercelCalls().length === 0);
r = await ask(null);
check('sin sesion tambien 403', r.status === 403 && vercelCalls().length === 0);

console.log('→ Sin configurar');
reset();
delete env.VERCEL_TOKEN;
r = await ask();
check('sin el token responde configured:false, con 200, y no llama a Vercel', r.status === 200 && r.body.configured === false && vercelCalls().length === 0, r.text);
reset();
delete env.VERCEL_PROJECT_ID;
r = await ask();
check('sin el id del proyecto, igual', r.status === 200 && r.body.configured === false);

console.log('→ El estado del despliegue');
reset();
r = await ask();
check('un despliegue listo se traduce a ready, con su hora y su mensaje de una linea', r.status === 200 && r.body.available === true && r.body.build.state === 'ready' && r.body.build.readyAt === '2026-10-24T20:01:10.000Z' && r.body.build.message === 'Bump version to 2.13.0', r.text);
const call = vercelCalls()[0];
check('pide solo el ultimo de produccion de ese proyecto y equipo, con el token', call.url.includes('projectId=prj_abc') && call.url.includes('target=production') && call.url.includes('limit=1') && call.url.includes('teamId=team_xyz') && call.init.headers.Authorization === `Bearer ${TOKEN}`, call.url);
check('el token no sale en la respuesta', !r.text.includes(TOKEN));
check('un enlace de vercel.com se conserva', r.body.build.inspectorUrl === 'https://vercel.com/equipo/proyecto/abc');

for (const [raw, expected] of [['ERROR', 'error'], ['BUILDING', 'building'], ['INITIALIZING', 'building'], ['QUEUED', 'queued'], ['CANCELED', 'canceled'], ['LO_QUE_SEA', 'unknown']]) {
  reset();
  vercel.body.deployments[0].readyState = raw;
  r = await ask();
  check(`${raw} → ${expected}`, r.body.build.state === expected, r.text);
}

reset();
delete vercel.body.deployments[0].readyState;
vercel.body.deployments[0].state = 'READY';
check('si solo viene `state` (sin readyState), tambien se entiende', (await ask()).body.build.state === 'ready');

reset();
vercel.body.deployments[0].inspectorUrl = 'https://malo.example/x';
vercel.body.deployments[0].meta = { githubCommitMessage: 'x'.repeat(300) };
r = await ask();
check('un enlace que no es de vercel.com no sale', r.body.build.inspectorUrl === null);
check('el mensaje del commit se corta a 140 caracteres', r.body.build.message.length === 140);

reset();
delete env.VERCEL_TEAM_ID;
await ask();
check('sin equipo no manda teamId', !vercelCalls()[0].url.includes('teamId'));

console.log('→ Cuando Vercel falla (nunca le llega al panel como un error)');
reset();
vercel = { status: 500, body: {} };
r = await ask();
check('un 500 de Vercel responde available:false con 200', r.status === 200 && r.body.available === false && !r.text.includes(TOKEN), r.text);
reset();
vercel = { throws: true };
r = await ask();
check('sin red hacia Vercel, igual', r.status === 200 && r.body.available === false);
reset();
vercel = { body: { deployments: [] } };
r = await ask();
check('un proyecto sin despliegues, tambien', r.status === 200 && r.body.available === false);

console.log(failed === 0 ? '\n✓ build-status en verde.' : `\n✗ ${failed} fallo(s).`);
process.exit(failed === 0 ? 0 : 1);
