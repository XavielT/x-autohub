/**
 * Genera supabase/seed.sql a partir de los mocks de src/shared/data.
 *
 * Se hace por script y no a mano para que el seed sea exactamente el mismo
 * contenido que la app muestra hoy con `useMockData: true`. Si cambias un mock,
 * vuelve a correr esto:
 *
 *   node scripts/generate-seed.mjs
 *
 * Usa el esbuild que ya trae Angular para compilar los .ts a un módulo temporal.
 */

import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ENTRY = `
export { AUTO_HUB_MOCK } from './src/shared/data/auto-hub.mock';
export { HUB_PART_MOCK } from './src/shared/data/hub-part.mock';
export { HUB_MARKET_ITEMS_MOCK } from './src/shared/data/hub-market-item.mock';
export { NEWS_MOCK } from './src/shared/data/new-card.mock';
export { SERVICIOS_CARD_MOCK } from './src/shared/data/servicios-card.mock';
export { SOCIAL_POSTS_MOCK, SOCIAL_CLUBS_MOCK, SOCIAL_EVENTS_MOCK } from './src/shared/data/social-hub.mock';
export { CHECKOUT_SHIPPING_OPTIONS_MOCK, CHECKOUT_PAYMENT_METHODS_MOCK } from './src/shared/data/checkout-options.mock';
`;

/** Escapa un valor para SQL. */
const sql = (value) => {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return `'${value.toISOString().slice(0, 10)}'`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `'{}'`;
    return `array[${value.map((v) => sql(v)).join(', ')}]`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
};

const rows = (values) => values.map((v) => `  (${v.join(', ')})`).join(',\n');

function table(name, columns, values, { identity = true } = {}) {
  if (values.length === 0) return '';
  const reset = identity
    ? `\nselect setval(pg_get_serial_sequence('public.${name}', 'id'),` +
      ` (select max(id) from public.${name}));\n`
    : '\n';
  return (
    `-- ${values.length} registro(s)\n` +
    `insert into public.${name} (${columns.join(', ')}) values\n` +
    `${rows(values)}\n` +
    `on conflict (id) do nothing;\n${reset}`
  );
}

const dir = await mkdtemp(join(tmpdir(), 'xah-seed-'));
try {
  const entryPath = join(dir, 'entry.ts');
  await writeFile(entryPath, ENTRY);

  const outfile = join(dir, 'mocks.mjs');
  await build({
    stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'error',
  });

  const m = await import(pathToFileURL(outfile).href);

  const parts = [];
  parts.push(`-- =============================================================================
-- X AutoHub — Datos iniciales
-- =============================================================================
-- GENERADO AUTOMÁTICAMENTE por scripts/generate-seed.mjs desde los mocks de
-- src/shared/models. No lo edites a mano: edita el mock y vuelve a generar.
--
-- Ejecutar **al final**, después de todas las migraciones: usa stars_rating
-- (0004), contact_phone (0010), status (0012) e is_test (0013). Ver la tabla de
-- puesta en marcha de docs/BACKEND.md.
--
-- Las rutas de imagen apuntan a los assets locales del frontend
-- (assets/imgs/...). Cuando subas las fotos reales a Storage, reemplázalas por
-- la URL pública del bucket.
-- =============================================================================
`);

  // --- Auto Hub -------------------------------------------------------------
  parts.push('\n-- Auto Hub: inventario propio\n');
  parts.push(
    table(
      'auto_hub_vehicles',
      ['id', 'brand', 'model', 'year', 'price', 'color', 'mileage', 'chasis_type',
       'doors', 'traction', 'fuel', 'cylinders', 'images', 'description', 'location', 'contact',
       'is_test'],
      m.AUTO_HUB_MOCK.map((a) => [
        sql(a.id), sql(a.brand), sql(a.model), sql(a.year), sql(a.price), sql(a.color),
        sql(a.mileage), `${sql(a.chasisType)}::public.chasis_type`, sql(a.doors),
        `${sql(a.traction)}::public.traction_type`, `${sql(a.fuel)}::public.fuel_type`,
        sql(a.cylinders), sql(a.images), sql(a.description), sql(a.location),
        sql(String(a.contact)), sql(a.isTest ?? false),
      ]),
    ),
  );

  // --- Catálogo -------------------------------------------------------------
  parts.push('\n-- Catálogo: piezas de la tienda propia\n');
  parts.push(
    table(
      'hub_parts',
      ['id', 'category', 'name', 'brand', 'img_url', 'images', 'stars_rating',
       'price', 'description', 'stock', 'is_test'],
      m.HUB_PART_MOCK.map((p) => [
        sql(p.id), sql(p.category), sql(p.name), sql(p.brand), sql(p.imgUrl),
        sql(p.images ?? []), sql(Number(p.starsRating)), sql(p.price),
        sql(p.description), sql(25), sql(p.isTest ?? false),
      ]),
    ),
  );

  // --- Hub Market -----------------------------------------------------------
  parts.push('\n-- Hub Market: publicaciones de la comunidad (seller_id null = contenido sembrado)\n');
  parts.push(
    table(
      'hub_market_items',
      ['id', 'seller_name', 'title', 'description', 'images', 'price', 'location',
       'contact_phone', 'category', 'condition', 'status', 'is_test', 'is_featured',
       'spec_year', 'spec_mileage', 'spec_hp',
       'spec_zero_to_100', 'spec_top_speed', 'spec_brand', 'spec_model', 'created_at'],
      m.HUB_MARKET_ITEMS_MOCK.map((i) => [
        sql(i.id), sql(i.sellerName), sql(i.title), sql(i.description), sql(i.images),
        sql(i.price), sql(i.location), sql(i.contactPhone ?? null),
        `${sql(i.category)}::public.hub_market_category`,
        i.condition ? `${sql(i.condition)}::public.item_condition` : 'null',
        // El seed corre sin sesion, y por eso `force_publication_status()` (0012)
        // no lo toca: aqui el estado se escribe a proposito.
        sql(i.status ?? 'aprobado'), sql(i.isTest ?? false),
        sql(i.isFeatured ?? false),
        sql(i.vehicleSpecs?.year), sql(i.vehicleSpecs?.mileage), sql(i.vehicleSpecs?.hp),
        sql(i.vehicleSpecs?.zeroTo100), sql(i.vehicleSpecs?.topSpeed),
        sql(i.vehicleSpecs?.brand), sql(i.vehicleSpecs?.model),
        i.createdAt ? sql(i.createdAt) : 'now()',
      ]),
    ),
  );

  // --- Servicios ------------------------------------------------------------
  parts.push('\n-- Servicios del taller\n');
  parts.push(
    table(
      'services',
      ['id', 'icon', 'title', 'description', 'sort_order'],
      m.SERVICIOS_CARD_MOCK.map((s, idx) => [
        sql(s.id), sql(s.icon), sql(s.title), sql(s.description), sql(idx),
      ]),
    ),
  );

  // --- Noticias -------------------------------------------------------------
  parts.push('\n-- Noticias\n');
  parts.push(
    table(
      'news',
      ['id', 'title', 'text', 'text_large', 'image_url', 'images', 'scope', 'author',
       'published_at', 'is_test'],
      m.NEWS_MOCK.map((n) => [
        sql(n.id), sql(n.title), sql(n.text), sql(n.textLarge), sql(n.imageUrl),
        sql(n.images), `${sql(n.location)}::public.news_scope`, sql(n.author ?? null),
        sql(n.date), sql(n.isTest ?? false),
      ]),
    ),
  );

  // --- Social Hub -----------------------------------------------------------
  parts.push('\n-- Social Hub: clubes\n');
  parts.push(
    table(
      'social_clubs',
      ['id', 'name', 'location', 'focus', 'description', 'image_url', 'members', 'is_official'],
      m.SOCIAL_CLUBS_MOCK.map((c) => [
        sql(c.id), sql(c.name), sql(c.location), sql(c.focus), sql(c.description),
        sql(c.imageUrl ?? null), sql(c.members), sql(c.isOfficial ?? false),
      ]),
    ),
  );

  parts.push('\n-- Social Hub: feed (author_id null = contenido sembrado)\n');
  parts.push(
    table(
      'social_posts',
      ['id', 'author_name', 'author_club', 'text', 'image_url', 'tags', 'likes', 'comments', 'created_at'],
      m.SOCIAL_POSTS_MOCK.map((p) => [
        sql(p.id), sql(p.authorName), sql(p.authorClub ?? null), sql(p.text),
        sql(p.imageUrl ?? null), sql(p.tags), sql(p.likes), sql(p.comments), sql(p.createdAt),
      ]),
    ),
  );

  parts.push('\n-- Social Hub: eventos\n');
  parts.push(
    table(
      'social_events',
      ['id', 'title', 'event_date', 'location', 'organizer', 'description', 'image_url', 'attendees', 'price'],
      m.SOCIAL_EVENTS_MOCK.map((e) => [
        sql(e.id), sql(e.title), sql(e.date), sql(e.location), sql(e.organizer),
        sql(e.description), sql(e.imageUrl ?? null), sql(e.attendees), sql(e.price),
      ]),
    ),
  );

  // --- Checkout -------------------------------------------------------------
  parts.push('\n-- Checkout: opciones de envío y métodos de pago (id de texto, sin secuencia)\n');
  parts.push(
    table(
      'shipping_options',
      ['id', 'label', 'description', 'price', 'eta_label', 'sort_order'],
      m.CHECKOUT_SHIPPING_OPTIONS_MOCK.map((o, idx) => [
        sql(o.id), sql(o.label), sql(o.description), sql(o.price), sql(o.etaLabel), sql(idx),
      ]),
      { identity: false },
    ),
  );
  parts.push(
    table(
      'payment_methods',
      ['id', 'label', 'description', 'sort_order'],
      m.CHECKOUT_PAYMENT_METHODS_MOCK.map((o, idx) => [
        sql(o.id), sql(o.label), sql(o.description), sql(idx),
      ]),
      { identity: false },
    ),
  );

  await writeFile('supabase/seed.sql', parts.join('\n'));

  const counts = {
    'auto_hub_vehicles': m.AUTO_HUB_MOCK.length,
    'hub_parts': m.HUB_PART_MOCK.length,
    'hub_market_items': m.HUB_MARKET_ITEMS_MOCK.length,
    'services': m.SERVICIOS_CARD_MOCK.length,
    'news': m.NEWS_MOCK.length,
    'social_clubs': m.SOCIAL_CLUBS_MOCK.length,
    'social_posts': m.SOCIAL_POSTS_MOCK.length,
    'social_events': m.SOCIAL_EVENTS_MOCK.length,
    'shipping_options': m.CHECKOUT_SHIPPING_OPTIONS_MOCK.length,
    'payment_methods': m.CHECKOUT_PAYMENT_METHODS_MOCK.length,
  };
  console.log('supabase/seed.sql generado:');
  for (const [t, n] of Object.entries(counts)) console.log(`  ${String(n).padStart(3)}  ${t}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
