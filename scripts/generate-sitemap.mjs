#!/usr/bin/env node
/**
 * Genera `public/sitemap.xml`: las páginas fijas del sitio, las categorías de la tienda,
 * y cada ficha de producto, de servicio, de vehículo de Auto Hub y de publicación de Hub Market.
 *
 *   node scripts/generate-sitemap.mjs
 *
 * Corre solo antes de cada build (`prebuild` en package.json) y `ng build` copia
 * `public/` a `dist/`. El archivo se genera: no se edita ni se versiona.
 *
 * DE DÓNDE SALEN LAS FICHAS
 * -------------------------
 * - **Con credenciales** (`supabaseUrl` y `supabaseAnonKey` de
 *   `src/environments/environment.production.ts`, que son públicas): se leen de
 *   Supabase por su API REST, solo lo que un visitante anónimo ve. Un producto de
 *   prueba o apagado **nunca** entra al sitemap.
 * - **Sin credenciales**: se leen de los mocks (para ver un sitemap completo en
 *   desarrollo sin base).
 * - **Con credenciales pero sin red** (o si la base responde un error): solo las
 *   páginas fijas, con un aviso. A propósito no se cae a los mocks: un sitemap de
 *   producción con fichas inventadas es peor que uno corto. Y no se rompe el build:
 *   el sitemap es un complemento, el sitio no depende de él.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STATIC_ROUTES, buildSitemap, dynamicEntries } from './sitemap-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/sitemap.xml');

// --- Credenciales -------------------------------------------------------------------

function readCredentials() {
  try {
    const source = readFileSync(resolve(ROOT, 'src/environments/environment.production.ts'), 'utf8');
    const url = source.match(/supabaseUrl:\s*'([^']*)'/)?.[1] ?? '';
    const key = source.match(/supabaseAnonKey:\s*'([^']*)'/)?.[1] ?? '';
    return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
  } catch {
    return null;
  }
}

// --- Supabase (lo que ve un visitante anónimo) --------------------------------------

async function rest(creds, path) {
  const res = await fetch(`${creds.url}/rest/v1/${path}`, {
    headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${path.split('?')[0]} respondió ${res.status}`);
  return res.json();
}

async function fromSupabase(creds) {
  const [categories, products, services, autos, marketItems] = await Promise.all([
    rest(creds, 'product_categories?select=slug&order=sort_order.asc'),
    // `is_test=eq.false`: aunque la política de lectura ya lo esconde del visitante, el
    // sitemap lo dice por su cuenta: un producto de prueba no se anuncia.
    rest(creds, 'hub_parts?select=slug,updated_at&is_active=eq.true&is_test=eq.false&order=id.asc'),
    rest(creds, 'services?select=slug&is_active=eq.true&order=sort_order.asc'),
    // Auto Hub: solo lo disponible y que no sea de prueba.
    rest(creds, 'auto_hub_vehicles?select=id,created_at&is_available=eq.true&is_test=eq.false&order=id.asc'),
    // Hub Market: solo lo aprobado y activo, a la venta y dentro de plazo (0030). Una publicación pendiente,
    // rechazada, vendida o vencida nunca se anuncia.
    rest(
      creds,
      `hub_market_items?select=id,category,created_at&is_active=eq.true&status=eq.aprobado&is_test=eq.false&sold_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=id.asc`,
    ),
  ]);
  return { categories, products, services, autos, marketItems };
}

// --- Mocks (sin credenciales) -------------------------------------------------------

async function fromMocks() {
  const { build } = await import('esbuild');
  const load = async (file, exportName) => {
    const result = await build({
      entryPoints: [resolve(ROOT, file)],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      logLevel: 'silent',
    });
    const code = result.outputFiles[0].text;
    const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    return mod[exportName];
  };

  const [categories, products, services, autos, marketItems] = await Promise.all([
    load('src/shared/data/product-category.mock.ts', 'PRODUCT_CATEGORIES_MOCK'),
    load('src/shared/data/hub-part.mock.ts', 'HUB_PART_MOCK'),
    load('src/shared/data/service.mock.ts', 'SERVICES_MOCK'),
    load('src/shared/data/auto-hub.mock.ts', 'AUTO_HUB_MOCK'),
    load('src/shared/data/hub-market-item.mock.ts', 'HUB_MARKET_ITEMS_MOCK'),
  ]);

  return {
    categories,
    products: products.filter((p) => p.isActive !== false && !p.isTest),
    services: services.filter((s) => s.isActive),
    autos: autos.filter((a) => !a.isTest),
    // Sin `status` (el contenido sembrado) se lee como aprobado, igual que en HubMarketService.
    marketItems: marketItems.filter((i) => (i.status ?? 'aprobado') === 'aprobado' && !i.isTest),
  };
}

// --- Principal ----------------------------------------------------------------------

async function main() {
  const creds = readCredentials();
  let rows = { categories: [], products: [], services: [], autos: [], marketItems: [] };
  let origin;

  try {
    // SITEMAP_MOCKS=1 fuerza los mocks aunque haya credenciales (para probar ese camino).
    if (creds && process.env.SITEMAP_MOCKS !== '1') {
      rows = await fromSupabase(creds);
      origin = 'Supabase';
    } else {
      rows = await fromMocks();
      origin = creds ? 'los mocks (SITEMAP_MOCKS=1)' : 'los mocks (no hay credenciales)';
    }
  } catch (error) {
    origin = 'solo las páginas fijas';
    console.warn(`[sitemap] No pude leer las fichas: ${error.message}. Se genera ${origin}.`);
  }

  const entries = [...STATIC_ROUTES, ...dynamicEntries(rows)];
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, buildSitemap(entries));
  console.log(
    `[sitemap] public/sitemap.xml: ${entries.length} URL (${rows.products.length} productos, ` +
      `${rows.services.length} servicios, ${rows.categories.length} categorías, ${rows.autos.length} vehículos, ` +
      `${rows.marketItems.length} publicaciones) desde ${origin}.`,
  );
}

// Solo corre cuando se ejecuta el archivo; importarlo (las pruebas) no genera nada.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.warn(`[sitemap] ${error.message}. El build sigue sin sitemap nuevo.`);
  });
}
