/**
 * La parte pura del sitemap (sin leer archivos ni red): `generate-sitemap.mjs` la usa
 * para armar `public/sitemap.xml`, y las pruebas la importan directamente. Por eso no
 * puede importar nada de `node:`.
 */

export const SITE_URL = 'https://xautohubrd.com';

/** Páginas que un buscador debe indexar. Lo de cuenta, pedidos y panel no entra. */
export const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/tienda', priority: '0.9', changefreq: 'daily' },
  { path: '/servicios', priority: '0.9', changefreq: 'weekly' },
  { path: '/servicios/cotizar', priority: '0.5', changefreq: 'monthly' },
  { path: '/servicios/agendar', priority: '0.6', changefreq: 'monthly' },
  { path: '/auto-hub', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub-market', priority: '0.5', changefreq: 'daily' },
  { path: '/social-hub', priority: '0.3', changefreq: 'weekly' },
  { path: '/terminos-condiciones', priority: '0.2', changefreq: 'yearly' },
];

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** `2026-10-23T14:00:00+00:00` → `2026-10-23`. Una fecha ilegible no pone `lastmod`. */
export function toDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/** El XML del sitemap a partir de una lista de `{ path, lastmod?, changefreq?, priority? }`. */
export function buildSitemap(entries) {
  const seen = new Set();
  const urls = entries
    .filter((e) => (seen.has(e.path) ? false : (seen.add(e.path), true)))
    .map((e) => {
      const lines = [`    <loc>${escapeXml(SITE_URL + e.path)}</loc>`];
      if (e.lastmod) lines.push(`    <lastmod>${e.lastmod}</lastmod>`);
      if (e.changefreq) lines.push(`    <changefreq>${e.changefreq}</changefreq>`);
      if (e.priority) lines.push(`    <priority>${e.priority}</priority>`);
      return `  <url>\n${lines.join('\n')}\n  </url>`;
    });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** Las rutas de las fichas a partir de las filas ya leídas (de la base o de los mocks). */
export function dynamicEntries({ categories = [], products = [], services = [] }) {
  return [
    ...categories.map((c) => ({ path: `/tienda/c/${c.slug}`, priority: '0.7', changefreq: 'weekly' })),
    ...products.map((p) => ({
      path: `/tienda/p/${p.slug}`,
      lastmod: toDate(p.updated_at ?? p.updatedAt),
      priority: '0.8',
      changefreq: 'weekly',
    })),
    ...services.map((s) => ({ path: `/servicios/${s.slug}`, priority: '0.7', changefreq: 'monthly' })),
  ];
}
