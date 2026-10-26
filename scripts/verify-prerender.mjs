// Comprueba, después del build, que lo prerenderizado salió con su contenido y no vacío:
//
//   node scripts/verify-prerender.mjs        (corre solo como `postbuild`)
//
// Por qué hace falta: el prerenderizado lee la base en cada build, y una página que se
// congela con "Cargando…" (una consulta que no terminó a tiempo, o un fallo de red) se publica
// igual y se queda así hasta el siguiente despliegue. Si algo de esto falla, el build falla y
// Vercel conserva el despliegue anterior, que es justo lo que se quiere.
//
// Qué mira, por cada página del sitemap que se prerenderiza:
//   · que exista su HTML;
//   · que no traiga ningún "Cargando" (un estado de carga que se quedó);
//   · que su <title> no sea el genérico (el producto, el servicio y la categoría ya cargaron);
//   · que su etiqueta canónica y og:url apunten a su propia dirección;
// y que haya una página por cada producto, servicio, categoría y vehículo de Auto Hub del sitemap.
// (Hub Market puede no tener ninguna publicación aprobada: ahí no se exige un mínimo.)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT = 'dist/x-autohub/browser';
const SITE_URL = 'https://xautohubrd.com';

const problems = [];
const fail = (message) => problems.push(message);

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error('[prerender] No hay dist/x-autohub/browser/index.html: ¿corrió el build?');
  process.exit(1);
}

const sitemap = fs.readFileSync('public/sitemap.xml', 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE_URL, '') || '/');

// Las fichas de Auto Hub y de Hub Market (una por vehículo o publicación).
const DETAIL = /^\/(auto-hub-details|car-details|hub-market-part-details|accessory-details)\/[^/]+$/;

// Lo que se prerenderiza (app.routes.server.ts). El resto va al navegador.
const PRERENDERED = [
  /^\/$/,
  /^\/tienda$/,
  /^\/tienda\/c\/[^/]+$/,
  /^\/tienda\/p\/[^/]+$/,
  /^\/servicios$/,
  /^\/servicios\/(?!cotizar$|agendar$)[^/]+$/,
  /^\/terminos-condiciones$/,
  /^\/auto-hub$/,
  /^\/hub-market$/,
  DETAIL,
];
const expected = urls.filter((u) => PRERENDERED.some((re) => re.test(u)));

const htmlOf = (route) => path.join(OUT, route === '/' ? '' : route, 'index.html');
const attr = (html, re) => re.exec(html)?.[1];

let checked = 0;
for (const route of expected) {
  const file = htmlOf(route);
  if (!fs.existsSync(file)) {
    fail(`${route}: no se prerenderizó (falta ${file})`);
    continue;
  }
  checked++;
  const html = fs.readFileSync(file, 'utf8');

  if (html.includes('Cargando')) fail(`${route}: quedó un "Cargando…" (la página se congeló antes de tener sus datos)`);

  const title = attr(html, /<title>([^<]*)<\/title>/);
  if (route.startsWith('/tienda/p/') && (!title || /^Producto \|/.test(title))) fail(`${route}: el título es el genérico (${title})`);
  if (route.startsWith('/servicios/') && (!title || /^Servicio/.test(title) || /^X AutoHub/.test(title))) fail(`${route}: el título es el genérico (${title})`);
  // El título de la ruta ("Detalle del vehiculo | …") es el que queda si la ficha no puso el suyo; "no encontrado", si no halló nada.
  if (DETAIL.test(route) && (!title || /^Detalle de/.test(title) || /no encontrad/i.test(title))) fail(`${route}: el título es el genérico (${title})`);
  if (DETAIL.test(route) && /no encontrad|inexistente/i.test(html)) fail(`${route}: la ficha dice que no encontró el vehículo o la publicación`);

  if (route.startsWith('/tienda/p/') || (route.startsWith('/servicios/') && route !== '/servicios') || DETAIL.test(route)) {
    const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
    const ogUrl = attr(html, /<meta property="og:url" content="([^"]+)"/);
    if (canonical !== SITE_URL + route) fail(`${route}: la etiqueta canónica es ${canonical}`);
    if (ogUrl !== SITE_URL + route) fail(`${route}: og:url es ${ogUrl}`);
    if (!/<meta property="og:image" content="https:\/\//.test(html)) fail(`${route}: og:image no es una URL absoluta`);
  }

  // Las fichas de la comunidad llevan su JSON-LD (Car o Product) con la misma URL que el canónico.
  if (DETAIL.test(route)) {
    const block = html.match(/<script[^>]*data-ld="listing"[^>]*>([\s\S]*?)<\/script>/);
    if (!block) fail(`${route}: no trae el JSON-LD de la ficha`);
    else {
      let ld = null;
      try {
        ld = JSON.parse(block[1]);
      } catch {
        fail(`${route}: el JSON-LD no es un JSON válido`);
      }
      if (ld) {
        if (!['Car', 'Product'].includes(ld['@type'])) fail(`${route}: el JSON-LD es de tipo ${ld['@type']}`);
        if (ld.url !== SITE_URL + route) fail(`${route}: la URL del JSON-LD es ${ld.url}`);
        if (!ld.offers?.price) fail(`${route}: el JSON-LD no trae el precio`);
      }
    }
  }

  if (route.startsWith('/tienda/p/') && !html.includes('prod__name')) fail(`${route}: no trae el nombre del producto`);
  if (route === '/tienda' && !html.includes('app-catalogo-card')) fail('/tienda: no trae ninguna tarjeta de producto');
  // Solo se exige una tarjeta si el sitemap dice que hay algo que enseñar: sin vehículos disponibles o con todas las
  // publicaciones vendidas o vencidas (0030), el listado vacío es lo correcto y no debe tumbar el despliegue.
  const hayVehiculos = urls.some((u) => /^\/auto-hub-details\//.test(u));
  const hayPublicaciones = urls.some((u) => /^\/(car-details|hub-market-part-details|accessory-details)\//.test(u));
  if (route === '/auto-hub' && hayVehiculos && !html.includes('app-autohub-card')) fail('/auto-hub: el sitemap trae vehículos y la página no');
  if (route === '/hub-market' && hayPublicaciones && !/app-(hub-market|car)-card/.test(html)) fail('/hub-market: el sitemap trae publicaciones y la página no');
}

// Una página por cada producto, categoría y servicio del sitemap. Los vehículos de Auto Hub y las publicaciones de Hub Market no se
// exigen: pueden no haber (todos vendidos, todas vencidas), y el sitio sigue siendo válido.
for (const [label, re] of [['productos', /^\/tienda\/p\//], ['categorías', /^\/tienda\/c\//], ['servicios', /^\/servicios\/(?!cotizar$|agendar$)[^/]+$/]]) {
  const inSitemap = urls.filter((u) => re.test(u)).length;
  if (inSitemap === 0) fail(`el sitemap no trae ${label}: sin ellos no hay nada que prerenderizar (¿falló la lectura de la base?)`);
}

// El módulo de supabase-js se precarga desde cada página (scripts/preload-supabase.mjs).
if (!/<link rel="modulepreload" href="chunk-[A-Z0-9]+\.js">/.test(fs.readFileSync(path.join(OUT, 'index.html'), 'utf8'))) {
  fail('index.html no precarga el módulo de supabase-js');
}

// Y el service worker no puede quedarse con el hash viejo de un HTML que se tocó después del build (modo seguro).
const ngswPath = path.join(OUT, 'ngsw.json');
if (fs.existsSync(ngswPath)) {
  const { hashTable = {} } = JSON.parse(fs.readFileSync(ngswPath, 'utf8'));
  for (const [key, expected] of Object.entries(hashTable)) {
    if (!key.endsWith('.html')) continue;
    const actual = crypto.createHash('sha1').update(fs.readFileSync(path.join(OUT, key))).digest('hex');
    if (actual !== expected) fail('ngsw.json tiene un hash viejo de ' + key + ': el service worker lo daría por corrupto');
  }
}

// La página que se sirve a lo que no está prerenderizado (carrito, pedidos, panel…).
if (!fs.existsSync(path.join(OUT, 'index.csr.html'))) fail('falta index.csr.html (el respaldo para las rutas del navegador)');

if (problems.length > 0) {
  console.error(`\n[prerender] ✗ ${problems.length} problema(s):`);
  for (const p of problems) console.error(`   · ${p}`);
  process.exit(1);
}

console.log(`[prerender] ✓ ${checked} páginas prerenderizadas, todas con su contenido.`);
