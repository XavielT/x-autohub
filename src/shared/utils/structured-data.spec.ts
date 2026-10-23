import { SITE_URL, absoluteUrl, productJsonLd, serializeJsonLd, serviceJsonLd } from './structured-data';
import { availabilityOf } from './product-availability';
import { makeProduct } from '../testing/product.fixture';
import { SERVICES_MOCK } from '../data/service.mock';
import { ReviewStats } from '../models/review.model';

const STATS: ReviewStats = { total: 3, average: 4.3, distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 } };

describe('structured-data', () => {
  describe('absoluteUrl', () => {
    it('una ruta de assets se vuelve absoluta sobre el sitio público', () => {
      expect(absoluteUrl('assets/imgs/x.jpg')).toBe(`${SITE_URL}/assets/imgs/x.jpg`);
      expect(absoluteUrl('/assets/imgs/x.jpg')).toBe(`${SITE_URL}/assets/imgs/x.jpg`);
    });

    it('una URL completa (Supabase Storage) se deja como está', () => {
      expect(absoluteUrl('https://abc.supabase.co/storage/v1/object/public/p/x.jpg')).toBe(
        'https://abc.supabase.co/storage/v1/object/public/p/x.jpg',
      );
    });
  });

  describe('productJsonLd', () => {
    const product = makeProduct({ id: 7, slug: 'disco-7', sku: 'XAH-000007', name: 'Disco GTR', brand: 'Brembo', price: 12950, imgUrl: 'assets/imgs/d.jpg', shortDescription: 'Disco ventilado' });

    it('trae nombre, sku, marca, imagen absoluta y la oferta en DOP', () => {
      const ld = productJsonLd(product, { availability: availabilityOf(product), stats: null });

      expect(ld).toMatchObject({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Disco GTR',
        sku: 'XAH-000007',
        brand: { '@type': 'Brand', name: 'Brembo' },
        image: [`${SITE_URL}/assets/imgs/d.jpg`],
        url: `${SITE_URL}/tienda/p/disco-7`,
        offers: { '@type': 'Offer', priceCurrency: 'DOP', price: '12950.00' },
      });
    });

    it('usa todas las imágenes si hay varias', () => {
      const ld = productJsonLd({ ...product, images: ['assets/a.jpg', 'https://x.co/b.jpg'] }, { availability: availabilityOf(product), stats: null });

      expect(ld['image']).toEqual([`${SITE_URL}/assets/a.jpg`, 'https://x.co/b.jpg']);
    });

    it('la disponibilidad sigue lo que dice la ficha: stock, bajo pedido y agotado', () => {
      const offer = (p: typeof product) =>
        (productJsonLd(p, { availability: availabilityOf(p), stats: null })['offers'] as { availability: string }).availability;

      expect(offer(product)).toBe('https://schema.org/InStock');
      expect(offer({ ...product, fulfillment: 'on_order', leadTimeDays: 10 })).toBe('https://schema.org/BackOrder');
      expect(offer({ ...product, stock: 0 })).toBe('https://schema.org/OutOfStock');
    });

    it('sin reseñas reales NO declara aggregateRating (las estrellas sembradas no cuentan)', () => {
      expect(productJsonLd(product, { availability: availabilityOf(product), stats: null })).not.toHaveProperty('aggregateRating');
      expect(
        productJsonLd(product, { availability: availabilityOf(product), stats: { ...STATS, total: 0, average: 0 } }),
      ).not.toHaveProperty('aggregateRating');
    });

    it('con reseñas reales, aggregateRating lleva el promedio y el total', () => {
      const ld = productJsonLd(product, { availability: availabilityOf(product), stats: STATS });

      expect(ld['aggregateRating']).toEqual({ '@type': 'AggregateRating', ratingValue: 4.3, reviewCount: 3, bestRating: 5, worstRating: 1 });
    });

    it('no incluye claves vacías', () => {
      const ld = productJsonLd({ ...product, shortDescription: '', description: '' }, { availability: availabilityOf(product), stats: null });

      expect(ld).not.toHaveProperty('description');
    });
  });

  describe('serviceJsonLd', () => {
    const withPrice = SERVICES_MOCK.find((s) => s.priceFrom !== null)!;
    const quote = SERVICES_MOCK.find((s) => s.priceFrom === null)!;

    it('un servicio con precio declara la oferta en DOP', () => {
      const ld = serviceJsonLd(withPrice, { stats: null });

      expect(ld).toMatchObject({
        '@type': 'Service',
        name: withPrice.title,
        url: `${SITE_URL}/servicios/${withPrice.slug}`,
        areaServed: { '@type': 'Country' },
        provider: { '@type': 'AutoRepair', name: 'X AutoHub', telephone: '+18099539782' },
        offers: { '@type': 'Offer', priceCurrency: 'DOP', price: withPrice.priceFrom!.toFixed(2) },
      });
    });

    it('"A cotizar" no es un precio: sin price_from no hay oferta', () => {
      expect(serviceJsonLd(quote, { stats: null })).not.toHaveProperty('offers');
    });

    it('aggregateRating solo con reseñas reales', () => {
      expect(serviceJsonLd(quote, { stats: null })).not.toHaveProperty('aggregateRating');
      expect(serviceJsonLd(quote, { stats: STATS })['aggregateRating']).toMatchObject({ ratingValue: 4.3, reviewCount: 3 });
    });
  });

  describe('serializeJsonLd', () => {
    it('escapa el "<" para que un texto no cierre el bloque script', () => {
      const out = serializeJsonLd({ name: 'x</script><script>alert(1)</script>' });

      expect(out).not.toContain('<');
      expect(JSON.parse(out).name).toBe('x</script><script>alert(1)</script>');
    });
  });
});
