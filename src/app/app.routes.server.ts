import { inject } from '@angular/core';
import { RenderMode, ServerRoute } from '@angular/ssr';
import { firstValueFrom } from 'rxjs';
import { CategoryService } from '../shared/services/category.service';
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
 * Las rutas con parámetro (`:slug`) salen de la misma base que el sitemap: el catálogo activo que
 * ve un visitante sin sesión. `scripts/verify-prerender.mjs` comprueba después del build que
 * esas páginas salieron con su contenido y no vacías.
 */
const slugs = async (read: () => Promise<{ slug: string }[]>) => (await read()).map(({ slug }) => ({ slug }));

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
  { path: '**', renderMode: RenderMode.Client },
];
