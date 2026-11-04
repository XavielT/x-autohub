import { toProduct, toService } from '../../core/supabase/mappers';
import { makeProduct } from '../testing/product.fixture';

describe('SEO de fichas (migración 0057)', () => {
  const productRow = {
    id: 1, category_id: 1, slug: 'p', sku: 'XAH-000001', name: 'P', brand: 'B', short_description: 's', img_url: 'x.jpg', images: ['x.jpg'], stars_rating: 4, price: 10,
    compare_at_price: null, description: 'd', stock: 1, is_active: true, is_test: false, is_featured: false, fulfillment: 'stock', lead_time_days: null, fitment_type: 'universal',
    installable: false, installation_service_id: null, specs: {}, sold_count: 0, created_at: '2026-11-04T00:00:00Z', updated_at: '2026-11-04T00:00:00Z', has_variants: false, variant_label: '',
  } as Parameters<typeof toProduct>[0];

  it('toProduct trae el SEO, los textos alternos y las preguntas cuando la ficha los pide', () => {
    const p = toProduct({ ...productRow, seo_title: 'Título SEO', seo_description: 'Descripción SEO', image_alts: ['Frente'], seo_faq: [{ q: '¿Material?', a: 'Cerámica.' }] });

    expect(p.seoTitle).toBe('Título SEO');
    expect(p.seoDescription).toBe('Descripción SEO');
    expect(p.imageAlts).toEqual(['Frente']);
    expect(p.faq).toEqual([{ q: '¿Material?', a: 'Cerámica.' }]);
  });

  it('desde una lista (search_products no los trae) quedan vacíos, sin romper nada', () => {
    const p = toProduct(productRow);

    expect(p.seoTitle).toBeNull();
    expect(p.imageAlts).toEqual([]);
    expect(p.faq).toEqual([]);
  });

  it('toService trae el SEO del servicio', () => {
    const s = toService({
      id: 1, icon: 'x', title: 'Aceite', description: 'd', sort_order: 1, is_active: true, slug: 'aceite', category: 'mantenimiento', price_from: null, duration_minutes: 60,
      is_bookable: true, images: [], long_description: '', seo_title: 'Cambio de aceite | X AutoHub', seo_description: 'Aceite y filtro.',
    });

    expect(s.seoTitle).toBe('Cambio de aceite | X AutoHub');
    expect(s.seoDescription).toBe('Aceite y filtro.');
  });

  it('el fixture de pruebas sigue armando productos sin SEO', () => {
    expect(makeProduct({}).seoTitle).toBeUndefined();
  });
});
