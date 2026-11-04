import { SITE_URL, absoluteUrl, autoHubJsonLd, hubMarketJsonLd, productJsonLd, serializeJsonLd, serviceJsonLd, workshopJsonLd } from './structured-data';
import { AUTO_HUB_MOCK } from '../data/auto-hub.mock';
import { HUB_MARKET_ITEMS_MOCK } from '../data/hub-market-item.mock';
import { HubMarketItemModel } from '../models/hub-market-item.model';
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

    it('lleva el número de parte como mpn, y sin él no inventa uno (migración 0051)', () => {
      const withPart = productJsonLd({ ...product, partNumber: '04465-02220' }, { availability: availabilityOf(product), stats: null });
      const without = productJsonLd({ ...product, partNumber: null }, { availability: availabilityOf(product), stats: null });

      expect(withPart['mpn']).toBe('04465-02220');
      expect('mpn' in without).toBe(false);
    });

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

  describe('workshopJsonLd', () => {
    const rule = (weekday: number, opensAt = '08:00:00', closesAt = '17:00:00', isExample = false) => ({ id: weekday, weekday, opensAt, closesAt, slotMinutes: 60, capacity: 1, isExample });
    const base = { address: 'Av. Churchill 1, Santo Domingo', hours: '', isExample: false };

    it('declara el taller como AutoRepair y AutoPartsStore con su dirección en RD', () => {
      const ld = workshopJsonLd(base, []);
      expect(ld).toMatchObject({
        '@type': ['AutoRepair', 'AutoPartsStore'],
        name: 'X AutoHub',
        telephone: '+18099539782',
        address: { '@type': 'PostalAddress', streetAddress: base.address, addressCountry: 'DO' },
      });
    });

    it('sin coordenadas cargadas no inventa un geo; con ellas, sí', () => {
      expect(workshopJsonLd(base, [])).not.toHaveProperty('geo');
      expect(workshopJsonLd({ ...base, lat: 18.4861, lng: -69.9312 }, [])['geo']).toEqual({ '@type': 'GeoCoordinates', latitude: 18.4861, longitude: -69.9312 });
    });

    it('el horario sale de las reglas de disponibilidad, con las horas en HH:mm y los días de schema.org', () => {
      const ld = workshopJsonLd(base, [rule(1), rule(6, '08:00:00', '13:00:00')]);
      expect(ld['openingHoursSpecification']).toEqual([
        { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Monday', opens: '08:00', closes: '17:00' },
        { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Saturday', opens: '08:00', closes: '13:00' },
      ]);
    });

    it('las reglas de ejemplo no se declaran, y sin reglas no hay horario', () => {
      expect(workshopJsonLd(base, [rule(1, '08:00', '17:00', true)])).not.toHaveProperty('openingHoursSpecification');
      expect(workshopJsonLd(base, [])).not.toHaveProperty('openingHoursSpecification');
    });
  });

  describe('autoHubJsonLd', () => {
    const auto = {
      ...AUTO_HUB_MOCK[0],
      id: 4,
      brand: 'Toyota',
      model: 'Corolla',
      year: 2020,
      price: 1000000,
      mileage: 40000,
      fuel: 'gasoline' as const,
      traction: 'fwd' as const,
      chasisType: 'sedan' as const,
      images: ['assets/imgs/c.jpg'],
    };

    it('es un Car con su ficha técnica y la oferta en DOP vendida por X AutoHub', () => {
      expect(autoHubJsonLd(auto)).toMatchObject({
        '@context': 'https://schema.org',
        '@type': 'Car',
        name: 'Toyota Corolla 2020',
        brand: { '@type': 'Brand', name: 'Toyota' },
        model: 'Corolla',
        vehicleModelDate: '2020',
        bodyType: 'Sedán',
        fuelType: 'Gasolina',
        driveWheelConfiguration: 'https://schema.org/FrontWheelDriveConfiguration',
        mileageFromOdometer: { '@type': 'QuantitativeValue', value: 40000, unitCode: 'KMT' },
        image: [`${SITE_URL}/assets/imgs/c.jpg`],
        url: `${SITE_URL}/auto-hub-details/4`,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'DOP',
          price: '1000000.00',
          availability: 'https://schema.org/InStock',
          itemCondition: 'https://schema.org/UsedCondition',
          seller: { '@type': 'AutoDealer', name: 'X AutoHub' },
        },
      });
    });

    it('no declara el teléfono del vehículo', () => {
      expect(JSON.stringify(autoHubJsonLd(auto))).not.toContain(auto.contact);
    });
  });

  describe('hubMarketJsonLd', () => {
    const car = HUB_MARKET_ITEMS_MOCK.find((i) => i.category === 'vehiculos')!;
    const part = HUB_MARKET_ITEMS_MOCK.find((i) => i.category === 'piezas')!;

    it('un vehículo es un Car, con su kilometraje, y su URL sale de la categoría', () => {
      const ld = hubMarketJsonLd(car)!;

      expect(ld['@type']).toBe('Car');
      expect(ld['url']).toBe(`${SITE_URL}/car-details/${car.id}`);
      expect(ld['mileageFromOdometer']).toMatchObject({ unitCode: 'KMT', value: car.vehicleSpecs!.mileage });
    });

    it('una pieza es un Product y no trae datos de vehículo', () => {
      const ld = hubMarketJsonLd(part)!;

      expect(ld['@type']).toBe('Product');
      expect(ld['url']).toBe(`${SITE_URL}/hub-market-part-details/${part.id}`);
      expect(ld).not.toHaveProperty('mileageFromOdometer');
      expect(ld['offers']).toMatchObject({ priceCurrency: 'DOP', price: part.price.toFixed(2) });
    });

    it('no publica el nombre del vendedor', () => {
      expect(JSON.stringify(hubMarketJsonLd(part))).not.toContain(part.sellerName);
    });

    it('lo usado y lo nuevo declaran su condición', () => {
      const used: HubMarketItemModel = { ...part, condition: 'used' };
      const fresh: HubMarketItemModel = { ...part, condition: 'new' };

      expect(hubMarketJsonLd(used)!['offers']).toMatchObject({ itemCondition: 'https://schema.org/UsedCondition' });
      expect(hubMarketJsonLd(fresh)!['offers']).toMatchObject({ itemCondition: 'https://schema.org/NewCondition' });
    });

    it('una publicación pendiente o rechazada no declara nada', () => {
      expect(hubMarketJsonLd({ ...part, status: 'pendiente' })).toBeNull();
      expect(hubMarketJsonLd({ ...part, status: 'rechazado' })).toBeNull();
      expect(hubMarketJsonLd({ ...part, status: 'aprobado' })).not.toBeNull();
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
