// @ts-expect-error — módulo de Node sin tipos; es la parte pura de scripts/generate-sitemap.mjs
import { SITE_URL, STATIC_ROUTES, buildSitemap, dynamicEntries, toDate } from '../../../scripts/sitemap-lib.mjs';
import { routes } from '../../app/app.routes';
import { SITE_URL as STRUCTURED_DATA_URL } from './structured-data';

interface Entry {
  path: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

const build = buildSitemap as (entries: Entry[]) => string;
const dynamic = dynamicEntries as (rows: Record<string, unknown[]>) => Entry[];
const toDay = toDate as (value: unknown) => string | undefined;
const STATIC = STATIC_ROUTES as Entry[];

describe('sitemap', () => {
  it('el sitio del sitemap y el de los datos estructurados son el mismo', () => {
    expect(SITE_URL).toBe(STRUCTURED_DATA_URL);
  });

  describe('las páginas fijas', () => {
    const routePaths = routes.map((r) => r.path);

    it('cada una es una ruta que existe en la app', () => {
      for (const { path } of STATIC) {
        const routePath = path === '/' ? '' : path.slice(1);
        expect(routePaths, `${path} no es una ruta de app.routes.ts`).toContain(routePath);
      }
    });

    it('ninguna es de cuenta, pedidos ni panel', () => {
      const forbidden = ['/admin', '/checkout', '/pedido', '/perfil', '/login', '/registro', '/publicar', '/baja', '/buscar'];
      for (const { path } of STATIC) {
        expect(forbidden.some((f) => path === f || path.startsWith(`${f}/`)), path).toBe(false);
      }
    });
  });

  describe('las fichas', () => {
    it('cada patrón dinámico corresponde a una ruta real', () => {
      const routePaths = routes.map((r) => r.path);

      expect(routePaths).toContain('tienda/c/:slug');
      expect(routePaths).toContain('tienda/p/:slug');
      expect(routePaths).toContain('servicios/:slug');
      expect(routePaths).toContain('auto-hub-details/:id');
      expect(routePaths).toContain('car-details/:id');
      expect(routePaths).toContain('hub-market-part-details/:id');
      expect(routePaths).toContain('accessory-details/:id');
    });

    it('arma una URL por cada vehículo de Auto Hub y por cada publicación, en la ruta de su categoría', () => {
      const entries = dynamic({
        autos: [{ id: 0, created_at: '2026-09-01T10:00:00+00:00' }, { id: 4 }],
        marketItems: [
          { id: 101, category: 'vehiculos' },
          { id: 201, category: 'piezas' },
          { id: 301, category: 'accesorios', created_at: '2026-10-02T10:00:00Z' },
        ],
      });

      expect(entries.map((e) => e.path)).toEqual([
        '/auto-hub-details/0',
        '/auto-hub-details/4',
        '/car-details/101',
        '/hub-market-part-details/201',
        '/accessory-details/301',
      ]);
      expect(entries[0].lastmod).toBe('2026-09-01');
      expect(entries[4].lastmod).toBe('2026-10-02');
    });

    it('una publicación de una categoría que no se conoce no inventa una ruta', () => {
      expect(dynamic({ marketItems: [{ id: 1, category: 'motos' }] })).toEqual([]);
    });

    it('las fichas de la comunidad pesan menos que las de la tienda', () => {
      const [auto, item] = dynamic({ autos: [{ id: 1 }], marketItems: [{ id: 2, category: 'vehiculos' }] });
      const [product] = dynamic({ products: [{ slug: 'x' }] });

      expect(Number(auto.priority)).toBeLessThan(Number(product.priority));
      expect(Number(item.priority)).toBeLessThan(Number(auto.priority));
    });

    it('arma una URL por categoría, producto y servicio', () => {
      const entries = dynamic({
        categories: [{ slug: 'frenos' }],
        products: [{ slug: 'disco-1', updated_at: '2026-10-23T14:00:00+00:00' }],
        services: [{ slug: 'frenos' }],
      });

      expect(entries.map((e) => e.path)).toEqual(['/tienda/c/frenos', '/tienda/p/disco-1', '/servicios/frenos']);
      expect(entries[1].lastmod).toBe('2026-10-23');
    });

    it('sin filas no inventa nada', () => {
      expect(dynamic({})).toEqual([]);
    });
  });

  describe('buildSitemap', () => {
    it('es un urlset del protocolo, con la URL absoluta de cada ruta', () => {
      const xml = build([{ path: '/tienda', priority: '0.9', changefreq: 'daily' }, { path: '/', lastmod: '2026-10-23' }]);

      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(xml).toContain(`<loc>${SITE_URL}/tienda</loc>`);
      expect(xml).toContain('<priority>0.9</priority>');
      expect(xml).toContain('<lastmod>2026-10-23</lastmod>');
    });

    it('no repite una URL', () => {
      const xml = build([{ path: '/tienda' }, { path: '/tienda' }]);

      expect(xml.match(/<loc>/g)).toHaveLength(1);
    });

    it('escapa los caracteres que romperían el XML', () => {
      const xml = build([{ path: '/tienda/p/a&b<c>' }]);

      expect(xml).toContain('a&amp;b&lt;c&gt;');
      expect(xml).not.toContain('a&b');
    });
  });

  describe('toDate', () => {
    it('recorta a la fecha, y lo ilegible no pone lastmod', () => {
      expect(toDay('2026-10-23T14:00:00Z')).toBe('2026-10-23');
      expect(toDay('ayer')).toBeUndefined();
      expect(toDay(null)).toBeUndefined();
    });
  });
});
