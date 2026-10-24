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
// y que haya una página por cada producto, servicio y categoría del sitemap.

import fs from 'node:fs';
import path from 'node:path';

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

// Lo que se prerenderiza (app.routes.server.ts). El resto va al navegador.
const PRERENDERED = [/^\/$/, /^\/tienda$/, /^\/tienda\/c\/[^/]+$/, /^\/tienda\/p\/[^/]+$/, /^\/servicios$/, /^\/servicios\/(?!cotizar$|agendar$)[^/]+$/, /^\/terminos-condiciones$/];
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

  if (route.startsWith('/tienda/p/') || (route.startsWith('/servicios/') && route !== '/servicios')) {
    const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
    const ogUrl = attr(html, /<meta property="og:url" content="([^"]+)"/);
    if (canonical !== SITE_URL + route) fail(`${route}: la etiqueta canónica es ${canonical}`);
    if (ogUrl !== SITE_URL + route) fail(`${route}: og:url es ${ogUrl}`);
    if (!/<meta property="og:image" content="https:\/\//.test(html)) fail(`${route}: og:image no es una URL absoluta`);
  }

  if (route.startsWith('/tienda/p/') && !html.includes('prod__name')) fail(`${route}: no trae el nombre del producto`);
  if (route === '/tienda' && !html.includes('app-catalogo-card')) fail('/tienda: no trae ninguna tarjeta de producto');
}

// Una página por cada producto, servicio y categoría del sitemap.
for (const [label, re] of [['productos', /^\/tienda\/p\//], ['categorías', /^\/tienda\/c\//], ['servicios', /^\/servicios\/(?!cotizar$|agendar$)[^/]+$/]]) {
  const inSitemap = urls.filter((u) => re.test(u)).length;
  if (inSitemap === 0) fail(`el sitemap no trae ${label}: sin ellos no hay nada que prerenderizar (¿falló la lectura de la base?)`);
}

// La página que se sirve a lo que no está prerenderizado (carrito, pedidos, panel…).
if (!fs.existsSync(path.join(OUT, 'index.csr.html'))) fail('falta index.csr.html (el respaldo para las rutas del navegador)');

if (problems.length > 0) {
  console.error(`\n[prerender] ✗ ${problems.length} problema(s):`);
  for (const p of problems) console.error(`   · ${p}`);
  process.exit(1);
}

console.log(`[prerender] ✓ ${checked} páginas prerenderizadas, todas con su contenido.`);
