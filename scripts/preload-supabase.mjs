// Después del build: le pone a cada HTML un <link rel="modulepreload"> del módulo de supabase-js.
//
//   node scripts/preload-supabase.mjs        (corre solo como parte de `postbuild`)
//
// Por qué: desde la 2.29.0 supabase-js no viaja en el JS inicial; se carga con `import()` la primera vez que
// una consulta lo necesita. Eso lo saca del camino de arranque, pero en las páginas que pintan con datos
// (/auto-hub) el navegador no sabe que lo va a necesitar hasta que el JS principal corre, y los datos esperan
// a que baje. El `modulepreload` lo baja en paralelo con el JS principal desde el primer byte del HTML.
//
// El nombre del módulo lleva un hash que cambia en cada build, así que se busca en dist/ por su contenido
// (el símbolo que supabase-js declara) en vez de escribirlo a mano. Si no lo encuentra, falla: sin esto la
// carga diferida queda sin su ayuda, y eso no debe pasar en silencio.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT = 'dist/x-autohub/browser';
const MARKER = '@supabase/supabase-js.traceContextExtractor';

if (!fs.existsSync(OUT)) {
  console.error(`[preload] No hay ${OUT}: ¿corrió el build?`);
  process.exit(1);
}

const chunks = fs.readdirSync(OUT).filter((f) => /^chunk-.*\.js$/.test(f));
const supabase = chunks.filter((f) => fs.readFileSync(path.join(OUT, f), 'utf8').includes(MARKER));
if (supabase.length !== 1) {
  console.error(`[preload] Esperaba un solo módulo de supabase-js y encontré ${supabase.length}: ${supabase.join(', ') || '(ninguno)'}.`);
  process.exit(1);
}
const href = supabase[0];
const tag = `<link rel="modulepreload" href="${href}">`;

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? (e.name === 'assets' ? [] : walk(p)) : e.name.endsWith('.html') ? [p] : [];
  });

let done = 0;
for (const file of walk(OUT)) {
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes(tag)) continue;
  if (!html.includes('</head>')) continue;
  fs.writeFileSync(file, html.replace('</head>', `${tag}</head>`));
  done++;
}

if (done === 0) {
  console.error('[preload] No pude poner el modulepreload en ningún HTML.');
  process.exit(1);
}
console.log(`[preload] ✓ modulepreload de ${href} en ${done} páginas.`);

// El service worker de Angular (ngsw.json) guarda el hash de cada archivo que precarga, y si el contenido no
// coincide declara el archivo corrupto y entra en modo seguro (los usuarios se quedan sin caché). `/index.html`
// está en esa tabla y acabamos de cambiarlo: se recalcula su hash aquí, con el mismo SHA-1 que usa Angular.
const ngsw = path.join(OUT, 'ngsw.json');
if (fs.existsSync(ngsw)) {
  const data = JSON.parse(fs.readFileSync(ngsw, 'utf8'));
  let fixed = 0;
  for (const key of Object.keys(data.hashTable ?? {})) {
    if (!key.endsWith('.html')) continue;
    const file = path.join(OUT, key);
    if (!fs.existsSync(file)) continue;
    const hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
    if (data.hashTable[key] !== hash) {
      data.hashTable[key] = hash;
      fixed++;
    }
  }
  fs.writeFileSync(ngsw, JSON.stringify(data));
  console.log(`[preload] ✓ ngsw.json: ${fixed} hash(es) de HTML actualizados.`);
}
