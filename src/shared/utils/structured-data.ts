import { ProductModel } from '../models/product.model';
import { ReviewStats } from '../models/review.model';
import { SERVICE_CATEGORY_LABELS, ServiceModel } from '../models/service.model';
import { Availability } from './product-availability';
import { STORE_PHONE } from './contact';

/**
 * El sitio público. Las URLs de los datos estructurados son las **canónicas**, no las
 * de donde se esté corriendo: desde localhost o un despliegue de prueba, un buscador que
 * leyera `http://localhost:4200/...` indexaría una dirección que no existe.
 */
export const SITE_URL = 'https://xautohubrd.com';

const SCHEMA = 'https://schema.org';

/** `assets/imgs/x.jpg` o `https://…` → siempre una URL absoluta. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}/${path.replace(/^\/+/, '')}`;
}

/** El `availability` de schema.org según lo que la ficha le dice al cliente. */
const AVAILABILITY: Record<Availability['kind'], string> = {
  in_stock: `${SCHEMA}/InStock`,
  // Bajo pedido: no hay existencia, pero llega en unos días.
  on_order: `${SCHEMA}/BackOrder`,
  out_of_stock: `${SCHEMA}/OutOfStock`,
};

/**
 * `aggregateRating` solo si hay reseñas **reales**. Declarar una calificación que no
 * existe va contra las reglas de Google; las estrellas sembradas de `starsRating` no
 * cuentan, por eso esto sale de `ReviewService.getStats()` y no del modelo.
 */
function aggregateRating(stats: ReviewStats | null): Record<string, unknown> | undefined {
  if (!stats || stats.total === 0) return undefined;
  return {
    '@type': 'AggregateRating',
    ratingValue: stats.average,
    reviewCount: stats.total,
    bestRating: 5,
    worstRating: 1,
  };
}

/** Quita las claves con valor `undefined` para no ensuciar el JSON. */
function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export interface ProductLdOptions {
  availability: Availability;
  stats: ReviewStats | null;
}

/** JSON-LD `Product` de la ficha. */
export function productJsonLd(product: ProductModel, options: ProductLdOptions): Record<string, unknown> {
  const url = `${SITE_URL}/tienda/p/${product.slug}`;
  const images = (product.images?.length ? product.images : [product.imgUrl]).map(absoluteUrl);
  const description = (product.shortDescription || product.description).trim();

  return compact({
    '@context': SCHEMA,
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    brand: { '@type': 'Brand', name: product.brand },
    image: images,
    description: description || undefined,
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'DOP',
      price: product.price.toFixed(2),
      availability: AVAILABILITY[options.availability.kind],
      itemCondition: `${SCHEMA}/NewCondition`,
      seller: { '@type': 'Organization', name: 'X AutoHub', url: SITE_URL },
    },
    aggregateRating: aggregateRating(options.stats),
  });
}

export interface ServiceLdOptions {
  stats: ReviewStats | null;
}

/** JSON-LD `Service` del detalle de un servicio del taller. */
export function serviceJsonLd(service: ServiceModel, options: ServiceLdOptions): Record<string, unknown> {
  const url = `${SITE_URL}/servicios/${service.slug}`;
  const description = (service.longDescription || service.description).trim();

  return compact({
    '@context': SCHEMA,
    '@type': 'Service',
    name: service.title,
    serviceType: SERVICE_CATEGORY_LABELS[service.category],
    description: description || undefined,
    url,
    image: service.images.length > 0 ? service.images.map(absoluteUrl) : undefined,
    areaServed: { '@type': 'Country', name: 'República Dominicana' },
    provider: {
      '@type': 'AutoRepair',
      name: 'X AutoHub',
      url: SITE_URL,
      telephone: `+1${STORE_PHONE}`,
    },
    // "A cotizar" no es un precio: sin `price_from` no se declara oferta.
    offers:
      service.priceFrom === null
        ? undefined
        : { '@type': 'Offer', url, priceCurrency: 'DOP', price: service.priceFrom.toFixed(2) },
    aggregateRating: aggregateRating(options.stats),
  });
}

/**
 * El JSON de un bloque `<script type="application/ld+json">`. Un `<` dentro de un
 * texto (un nombre de producto con `</script>`) cerraría el bloque antes de tiempo:
 * se escapa.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
