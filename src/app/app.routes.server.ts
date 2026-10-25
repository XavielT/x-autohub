import { inject } from '@angular/core';
import { RenderMode, ServerRoute } from '@angular/ssr';
import { firstValueFrom } from 'rxjs';
import { AutoHubService } from '../shared/services/auto-hub.service';
import { CategoryService } from '../shared/services/category.service';
import { HubMarketService } from '../shared/services/hub-market.service';
import { ProductService } from '../shared/services/product.service';
import { ServiceCatalogService } from '../shared/services/service-catalog.service';

/**
 * Qué páginas se prerenderizan al construir el sitio (`outputMode: "static"`) y cuáles se dejan
 * al navegador.
 *
 * Se prerenderiza lo que un buscador o la vista previa de WhatsApp tiene que poder leer sin
 * ejecutar JavaScript: el home, la tienda y sus categorías, **cada ficha de producto** (su
 * título, su descripción y las etiquetas `og:*` de la vista previa), el taller y sus servicios.
 * Lo demás (carrito, pedidos, cuenta, panel, formularios) depende de quien lo abre y se queda
 * en el navegador: `RenderMode.Client`.
 *
 * También Auto Hub (los vehículos que vende X AutoHub) y Hub Market (las publicaciones aprobadas de la
 * comunidad), con una ficha por cada vehículo o publicación: su título, su descripción y su vista previa
 * al compartir el enlace.
 *
 * Las rutas con parámetro (`:slug`, `:id`) salen de la misma base que el sitemap: lo activo y aprobado que
 * ve un visitante sin sesión. `scripts/verify-prerender.mjs` comprueba después del build que
 * esas páginas salieron con su contenido y no vacías.
 */
const slugs = async (read: () => Promise<{ slug: string }[]>) => (await read()).map(({ slug }) => ({ slug }));
const ids = async (read: () => Promise<{ id: number }[]>) => (await read()).map(({ id }) => ({ id: String(id) }));

/** Una ruta de ficha de Hub Market: una página por cada publicación aprobada de esa categoría. */
const marketDetail = (path: string, category: 'vehiculos' | 'piezas' | 'accesorios'): ServerRoute => ({
  path,
  renderMode: RenderMode.Prerender,
  getPrerenderParams: () => {
    const market = inject(HubMarketService);
    return ids(async () => (await firstValueFrom(market.getAll())).filter((item) => item.category === category));
  },
});

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'tienda', renderMode: RenderMode.Prerender },
  {
    path: 'tienda/c/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: () => {
      const categories = inject(CategoryService);
      return slugs(async () => (await firstValueFrom(categories.getAll())).filter((c) => c.isActive));
    },
  },
  {
    path: 'tienda/p/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: () => {
      const products = inject(ProductService);
      return slugs(() => firstValueFrom(products.getAll()));
    },
  },
  { path: 'servicios', renderMode: RenderMode.Prerender },
  // Los formularios del taller son del navegador: van antes de `servicios/:slug`, que si no los capturaría.
  { path: 'servicios/cotizar', renderMode: RenderMode.Client },
  { path: 'servicios/agendar', renderMode: RenderMode.Client },
  {
    path: 'servicios/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: () => {
      const services = inject(ServiceCatalogService);
      return slugs(() => firstValueFrom(services.getServices()));
    },
  },
  { path: 'terminos-condiciones', renderMode: RenderMode.Prerender },

  // Auto Hub: el listado y la ficha de cada vehículo disponible.
  { path: 'auto-hub', renderMode: RenderMode.Prerender },
  {
    path: 'auto-hub-details/:id',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: () => {
      const autos = inject(AutoHubService);
      return ids(() => firstValueFrom(autos.getAll()));
    },
  },

  // Hub Market: el listado y una ficha por publicación, en la ruta de su categoría.
  { path: 'hub-market', renderMode: RenderMode.Prerender },
  marketDetail('car-details/:id', 'vehiculos'),
  marketDetail('hub-market-part-details/:id', 'piezas'),
  marketDetail('accessory-details/:id', 'accesorios'),
  { path: '**', renderMode: RenderMode.Client },
];
