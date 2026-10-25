import {
  toAutoHubVehicle,
  toHubMarketItem,
  toNews,
  toProduct,
  toProductCategory,
  toProductFitment,
  toProductVariant,
  toOrderView,
  toCoupon,
  toCouponValidation,
  toProfileVehicle,
  toReview,
  toReviewStats,
  toSocialPost,
  toUserOrder,
  toSpecs,
  toVehicleMake,
  toVehicleModel,
  fromHubMarketItem,
} from './mappers';
import {
  AutoHubVehicleRow,
  HubMarketItemRow,
  HubPartRow,
  NewsRow,
  ReviewRow,
  SearchProductRow,
  SocialPostRow,
} from './database.types';

describe('mappers', () => {
  describe('toHubMarketItem', () => {
    const base: HubMarketItemRow = {
      id: 101,
      seller_id: null,
      seller_name: 'Juan M.',
      title: 'Toyota Supra MK4',
      description: 'Restaurada',
      images: ['a.jpg', 'b.jpg'],
      price: 130000,
      location: 'Santo Domingo',
      contact_phone: '8095550134',
      category: 'vehiculos',
      condition: null,
      status: 'aprobado',
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      is_featured: true,
      is_active: true,
      is_test: false,
      spec_year: 1994,
      spec_mileage: 180000,
      spec_hp: 873,
      spec_zero_to_100: 3.8,
      spec_top_speed: 350,
      spec_brand: 'Toyota',
      spec_model: 'Supra',
      created_at: '2026-04-12T00:00:00Z',
      sold_at: null,
      expires_at: '2026-06-11T00:00:00Z',
    };

    it('lee el ciclo de vida: la fecha de vencimiento, y vendida solo si la hay', () => {
      expect(toHubMarketItem(base)).toMatchObject({ soldAt: undefined, expiresAt: '2026-06-11T00:00:00Z' });
      expect(toHubMarketItem({ ...base, sold_at: '2026-05-01T00:00:00Z' }).soldAt).toBe('2026-05-01T00:00:00Z');
    });

    it('rearma vehicleSpecs desde las columnas planas', () => {
      const item = toHubMarketItem(base);

      expect(item.vehicleSpecs).toEqual({
        year: 1994,
        mileage: 180000,
        hp: 873,
        zeroTo100: 3.8,
        topSpeed: 350,
        brand: 'Toyota',
        model: 'Supra',
      });
    });

    it('deja vehicleSpecs indefinido cuando no es un vehiculo', () => {
      const part = toHubMarketItem({
        ...base,
        category: 'piezas',
        spec_year: null,
        spec_mileage: null,
        spec_hp: null,
        spec_zero_to_100: null,
        spec_top_speed: null,
        spec_brand: null,
        spec_model: null,
      });

      expect(part.vehicleSpecs).toBeUndefined();
    });

    it('prefiere el nombre del perfil sobre la copia sembrada', () => {
      const withProfile = toHubMarketItem({
        ...base,
        seller_id: 'uuid-1',
        profiles: { display_name: 'Juan Manuel' },
      });

      expect(withProfile.sellerName).toBe('Juan Manuel');
      expect(withProfile.sellerId).toBe('uuid-1');
    });

    it('usa seller_name cuando no hay perfil asociado', () => {
      expect(toHubMarketItem(base).sellerName).toBe('Juan M.');
    });

    it('trae el telefono de contacto de la publicacion', () => {
      expect(toHubMarketItem(base).contactPhone).toBe('8095550134');
    });

    it('deja contactPhone indefinido cuando la publicacion no trae telefono', () => {
      expect(toHubMarketItem({ ...base, contact_phone: null }).contactPhone).toBeUndefined();
    });

    it('deriva la ruta de detalle segun la categoria', () => {
      expect(toHubMarketItem(base).detailRoute).toBe('/car-details/101');
      expect(toHubMarketItem({ ...base, category: 'piezas' }).detailRoute).toBe(
        '/hub-market-part-details/101',
      );
      expect(toHubMarketItem({ ...base, category: 'accesorios' }).detailRoute).toBe(
        '/accessory-details/101',
      );
    });
  });

  describe('fromHubMarketItem', () => {
    it('aplana vehicleSpecs a columnas y fija el vendedor', () => {
      const row = fromHubMarketItem(
        {
          title: 'Golf MK4',
          description: 'Project car',
          images: ['g.jpg'],
          price: 8000,
          location: 'Santiago',
          sellerName: 'ignorado',
          category: 'vehiculos',
          vehicleSpecs: { year: 2003, mileage: 210000, hp: 325 },
        },
        'uuid-2',
        'AutoHub Garage',
      );

      expect(row.seller_id).toBe('uuid-2');
      expect(row.seller_name).toBe('AutoHub Garage');
      expect(row.spec_year).toBe(2003);
      expect(row.spec_mileage).toBe(210000);
      expect(row.spec_hp).toBe(325);
      // Los opcionales ausentes viajan como null, no undefined.
      expect(row.spec_top_speed).toBeNull();
      expect(row.contact_phone).toBeNull();
    });

    it('lleva el telefono de contacto tal como se lo dieron, ya normalizado', () => {
      const row = fromHubMarketItem(
        {
          title: 'Discos Brembo',
          description: 'Poco uso',
          images: ['d.jpg'],
          price: 600,
          location: 'Santo Domingo',
          sellerName: 'Racing Parts RD',
          category: 'piezas',
          contactPhone: '8295550187',
        },
        'uuid-3',
        'Racing Parts RD',
      );

      expect(row.contact_phone).toBe('8295550187');
    });
  });

  describe('toProduct', () => {
    const row: HubPartRow = {
      id: 1,
      name: 'Disco GTR',
      brand: 'Brembo',
      img_url: 'disco.jpg',
      images: [],
      stars_rating: 4.9,
      stars_seed: 4.9,
      review_count: 0,
      price: 12950,
      description: 'Alto rendimiento',
      stock: 25,
      is_active: true,
      is_test: false,
      created_at: '2026-01-01T00:00:00Z',
      category_id: 6,
      slug: 'disco-gtr-1',
      sku: 'XAH-000001',
      short_description: 'Disco ventilado',
      compare_at_price: null,
      is_featured: false,
      fulfillment: 'stock',
      lead_time_days: null,
      fitment_type: 'specific',
      installable: false,
      installation_service_id: null,
      specs: {},
      sold_count: 0,
      updated_at: '2026-01-02T00:00:00Z',
      variant_label: '',
      has_variants: false,
    };

    it('mapea snake_case a camelCase, con las columnas de la tienda', () => {
      const p = toProduct(row);
      expect(p.categoryId).toBe(6);
      expect(p.slug).toBe('disco-gtr-1');
      expect(p.sku).toBe('XAH-000001');
      expect(p.shortDescription).toBe('Disco ventilado');
      expect(p.fulfillment).toBe('stock');
      expect(p.fitmentType).toBe('specific');
      expect(p.isActive).toBe(true);
      expect(p.updatedAt?.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    });

    it('convierte la calificacion numerica a numero, como espera la plantilla', () => {
      expect(toProduct(row).starsRating).toBe(4.9);
      // Postgres devuelve numeric como texto en algunos clientes.
      expect(toProduct({ ...row, stars_rating: '4.9' as unknown as number }).starsRating).toBe(4.9);
    });

    it('deja images indefinido cuando el arreglo viene vacio', () => {
      expect(toProduct(row).images).toBeUndefined();
      expect(toProduct({ ...row, images: ['a.jpg'] }).images).toEqual(['a.jpg']);
    });

    it('un producto sin oferta tiene compareAtPrice nulo, y con oferta es un numero', () => {
      expect(toProduct(row).compareAtPrice).toBeNull();
      expect(toProduct({ ...row, compare_at_price: '14900.00' as unknown as number }).compareAtPrice).toBe(14900);
    });

    it('lee una fila de search_products() igual que una de hub_parts', () => {
      const found: SearchProductRow = { ...row, total_count: 12 };
      expect(toProduct(found).slug).toBe('disco-gtr-1');
    });

    it('un producto sin opciones dice hasVariants false y no tiene etiqueta', () => {
      const p = toProduct(row);
      expect(p.hasVariants).toBe(false);
      expect(p.variantLabel).toBe('');
    });

    it('uno con opciones trae su etiqueta ("Color") y hasVariants true', () => {
      const p = toProduct({ ...row, has_variants: true, variant_label: 'Color' });
      expect(p.hasVariants).toBe(true);
      expect(p.variantLabel).toBe('Color');
    });
  });

  describe('opciones de producto', () => {
    it('toProductVariant mapea la fila', () => {
      expect(
        toProductVariant({
          id: 3,
          product_id: 8,
          name: 'Negro',
          sku: 'ALF-NEG',
          stock: 8,
          sort_order: 1,
          is_active: true,
          created_at: '2026-10-01T00:00:00Z',
          image_url: null,
        }),
      ).toEqual({ id: 3, productId: 8, name: 'Negro', sku: 'ALF-NEG', stock: 8, sortOrder: 1, isActive: true, imageUrl: null });
    });

    it('la foto de la opción llega tal cual', () => {
      const v = toProductVariant({
        id: 5,
        product_id: 8,
        name: 'Rojo',
        sku: null,
        stock: 2,
        sort_order: 3,
        is_active: true,
        created_at: '2026-10-01T00:00:00Z',
        image_url: 'assets/imgs/hub-parts/alfombras-rojas.jpg',
      });
      expect(v.imageUrl).toBe('assets/imgs/hub-parts/alfombras-rojas.jpg');
    });

    it('un sku nulo se queda nulo', () => {
      const v = toProductVariant({
        id: 4,
        product_id: 8,
        name: 'Gris',
        sku: null,
        stock: 0,
        sort_order: 2,
        is_active: false,
        created_at: '2026-10-01T00:00:00Z',
          image_url: null,
      });
      expect(v.sku).toBeNull();
      expect(v.isActive).toBe(false);
    });
  });

  describe('reseñas', () => {
    const row: ReviewRow = {
      id: 7,
      target_type: 'product',
      target_id: 5,
      user_id: 'uuid-1',
      rating: 4,
      comment: 'Bien',
      is_verified_purchase: true,
      created_at: '2026-10-01T12:00:00Z',
      profiles: { display_name: 'Ana' },
    };

    it('toReview mapea la fila, con el nombre del perfil', () => {
      const r = toReview(row);
      expect(r).toMatchObject({ id: 7, target: 'product', targetId: 5, userId: 'uuid-1', rating: 4, authorName: 'Ana', isVerifiedPurchase: true });
      expect(r.createdAt.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    });

    it('un perfil sin nombre (o sin embed) sale como "Cliente"', () => {
      expect(toReview({ ...row, profiles: null }).authorName).toBe('Cliente');
      expect(toReview({ ...row, profiles: { display_name: '  ' } }).authorName).toBe('Cliente');
      expect(toReview({ ...row, profiles: undefined }).authorName).toBe('Cliente');
    });

    it('toReviewStats convierte el numeric (que llega como texto) y arma la distribucion', () => {
      const stats = toReviewStats({ total: 3, average: '4.3' as unknown as number, c1: 0, c2: 0, c3: 1, c4: 1, c5: 1 });
      expect(stats).toEqual({ total: 3, average: 4.3, distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 } });
    });
  });

  describe('cupones (migración 0022)', () => {
    const row = {
      id: 3,
      code: 'VERANO25',
      description: '25 con tope',
      discount_type: 'percent' as const,
      discount_value: '25.00' as unknown as number,
      min_subtotal: '0.00' as unknown as number,
      max_discount: '1500.00' as unknown as number,
      starts_at: null,
      ends_at: '2099-01-01T00:00:00Z',
      max_uses: null,
      max_uses_per_customer: 2,
      is_active: true,
      created_at: '2026-10-02T12:00:00Z',
    };

    it('toCoupon: los numeric llegan como texto y se vuelven números; las fechas, Date', () => {
      const c = toCoupon(row, 7);

      expect(c).toMatchObject({ id: 3, code: 'VERANO25', type: 'percent', value: 25, minSubtotal: 0, maxDiscount: 1500, maxUsesPerCustomer: 2, uses: 7 });
      expect(c.endsAt).toBeInstanceOf(Date);
      expect(c.startsAt).toBeNull();
      expect(c.maxUses).toBeNull();
    });

    it('un envío gratis no trae valor ni tope: quedan nulos, no cero', () => {
      const c = toCoupon({ ...row, discount_type: 'free_shipping', discount_value: null, max_discount: null });

      expect(c).toMatchObject({ type: 'free_shipping', value: null, maxDiscount: null, uses: 0 });
    });

    it('toCouponValidation: el descuento llega como numeric (texto)', () => {
      const v = toCouponValidation({ code: 'PCT10', discount_type: 'percent', discount_amount: '100.00' as unknown as number, description: 'x' });

      expect(v).toEqual({ code: 'PCT10', type: 'percent', discount: 100, description: 'x' });
    });
  });

  describe('toSpecs', () => {
    it('deja pasar los pares de texto', () => {
      expect(toSpecs({ Material: 'Aluminio', Medida: '18x8.5' })).toEqual({ Material: 'Aluminio', Medida: '18x8.5' });
    });

    it('convierte en texto lo que alguien cargo como numero o booleano', () => {
      expect(toSpecs({ Piezas: 4, Reusable: true })).toEqual({ Piezas: '4', Reusable: 'true' });
    });

    it('descarta los nulos y lo que no es un objeto', () => {
      expect(toSpecs({ A: null, B: 'x' })).toEqual({ B: 'x' });
      expect(toSpecs(null)).toEqual({});
      expect(toSpecs([1, 2])).toEqual({});
      expect(toSpecs('texto')).toEqual({});
    });
  });

  describe('catalogo de vehiculos y categorias', () => {
    it('toProductCategory', () => {
      expect(
        toProductCategory({
          id: 7,
          parent_id: 6,
          slug: 'discos',
          name: 'Discos',
          icon: null,
          sort_order: 10,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        }),
      ).toEqual({ id: 7, parentId: 6, slug: 'discos', name: 'Discos', icon: null, sortOrder: 10, isActive: true });
    });

    it('toVehicleMake y toVehicleModel', () => {
      expect(toVehicleMake({ id: 1, name: 'Toyota', slug: 'toyota' })).toEqual({ id: 1, name: 'Toyota', slug: 'toyota' });
      expect(toVehicleModel({ id: 2, make_id: 1, name: 'Corolla', slug: 'corolla' })).toEqual({
        id: 2,
        makeId: 1,
        name: 'Corolla',
        slug: 'corolla',
      });
    });

    it('toProductFitment conserva los nulos: toda la marca, sin limite de anos', () => {
      expect(
        toProductFitment({ id: 1, product_id: 9, make_id: 1, model_id: null, year_from: null, year_to: 2020 }),
      ).toEqual({ id: 1, productId: 9, makeId: 1, modelId: null, yearFrom: null, yearTo: 2020 });
    });

    it('toProfileVehicle', () => {
      expect(
        toProfileVehicle({
          id: 3,
          user_id: 'u-1',
          make_id: 1,
          model_id: 2,
          year: 2015,
          nickname: 'El diario',
          is_default: true,
          created_at: '2026-01-01T00:00:00Z',
        }),
      ).toEqual({ id: 3, userId: 'u-1', makeId: 1, modelId: 2, year: 2015, nickname: 'El diario', isDefault: true });
    });
  });

  describe('toAutoHubVehicle', () => {
    it('mapea snake_case a camelCase', () => {
      const row: AutoHubVehicleRow = {
        id: 0,
        brand: 'Citroen',
        model: 'DS3',
        year: 2015,
        price: 480000,
        color: 'Gris',
        mileage: 92000,
        chasis_type: 'hatchback',
        doors: 2,
        traction: 'fwd',
        fuel: 'gasoline',
        cylinders: 4,
        images: ['ds3.jpeg'],
        description: 'Lorem',
        location: 'Santo Domingo Este',
        contact: '8099539782',
        is_available: true,
        is_test: false,
        created_at: '2026-01-01T00:00:00Z',
      };

      const auto = toAutoHubVehicle(row);
      expect(auto.chasisType).toBe('hatchback');
      expect(auto.contact).toBe('8099539782');
    });
  });

  describe('toNews', () => {
    it('parsea la fecha a mediodia UTC para que no retroceda un dia en RD', () => {
      const row: NewsRow = {
        id: 1,
        title: '809 Expo',
        text: 'corto',
        text_large: 'largo',
        image_url: 'expo.jpg',
        images: [],
        scope: 'local',
        author: null,
        published_at: '2026-04-15',
        is_published: true,
        is_test: false,
      };

      // RD es UTC-4: a mediodía UTC siguen siendo las 8am del mismo día.
      expect(toNews(row).date.toISOString().slice(0, 10)).toBe('2026-04-15');
    });
  });

  describe('toSocialPost', () => {
    const row: SocialPostRow = {
      id: 1,
      author_id: null,
      author_name: 'Juan M.',
      author_club: 'Supra Club RD',
      text: 'Build listo',
      image_url: null,
      tags: ['2JZ'],
      likes: 184,
      comments: 32,
      created_at: '2026-08-09T18:30:00Z',
    };

    it('toma la insignia de verificado del perfil', () => {
      expect(toSocialPost(row).isVerified).toBe(false);

      const verified = toSocialPost({
        ...row,
        author_id: 'uuid-3',
        profiles: { display_name: 'Juan Manuel', is_verified: true },
      });
      expect(verified.isVerified).toBe(true);
      expect(verified.authorName).toBe('Juan Manuel');
    });
  });

  describe('pedidos (0018)', () => {
    const json = {
      id: 'o-1',
      order_number: 1042,
      status: 'awaiting_payment' as const,
      fulfillment_type: 'pickup' as const,
      payment_method_id: 'transfer',
      wants_installation: true,
      subtotal: '12050.00' as unknown as number,
      shipping_price: 0,
      discount: '0.00' as unknown as number,
      coupon_code: null as string | null,
      total: '12050.00' as unknown as number,
      created_at: '2026-10-23T14:00:00Z',
      has_proof: true,
      whatsapp_opened_at: null,
      payment_confirmed_at: '2026-10-23T15:00:00Z',
      installation_service_id: 7,
      items: [{ name: 'Disco', unit_price: '6025.00' as unknown as number, quantity: 2 }],
      history: [
        { from_status: null, to_status: 'awaiting_payment' as const, note: null, created_at: '2026-10-23T14:00:00Z' },
      ],
    };

    it('get_order() → OrderView: números como números, fechas como fechas', () => {
      const v = toOrderView(json);

      expect(v.orderNumber).toBe(1042);
      expect(v.fulfillment).toBe('pickup');
      expect(v.subtotal).toBe(12050);
      expect(v.total).toBe(12050);
      expect(v.items[0]).toEqual({ name: 'Disco', unitPrice: 6025, quantity: 2 });
      expect(v.createdAt).toBeInstanceOf(Date);
      expect(v.paymentConfirmedAt).toBeInstanceOf(Date);
      expect(v.whatsappOpenedAt).toBeNull();
      expect(v.installationServiceId).toBe(7);
      expect(v.history[0].createdAt).toBeInstanceOf(Date);
      expect(v.history[0].fromStatus).toBeNull();
    });

    it('get_order() trae el descuento y el cupón; sin cupón, 0 y nulo', () => {
      expect(toOrderView(json)).toMatchObject({ discount: 0, couponCode: null });

      const con = toOrderView({ ...json, discount: '1205.00' as unknown as number, coupon_code: 'BIENVENIDO10' });
      expect(con).toMatchObject({ discount: 1205, couponCode: 'BIENVENIDO10' });
    });

    it('un get_order() de antes de la 0022 (sin los campos nuevos) no rompe: descuento 0', () => {
      const viejo = { ...json } as Record<string, unknown>;
      delete viejo['discount'];
      delete viejo['coupon_code'];

      expect(toOrderView(viejo as unknown as typeof json)).toMatchObject({ discount: 0, couponCode: null });
    });

    it('my_orders() → UserOrderModel: la suma de unidades llega como bigint (texto)', () => {
      const o = toUserOrder({
        id: 'o-1',
        order_number: 1042,
        status: 'paid',
        fulfillment_type: 'shipping',
        payment_method_id: 'whatsapp',
        total: '3300.00' as unknown as number,
        created_at: '2026-10-23T14:00:00Z',
        item_count: '3' as unknown as number,
        has_proof: false,
        wants_installation: false,
      });

      expect(o.itemCount).toBe(3);
      expect(o.total).toBe(3300);
      expect(o.orderNumber).toBe(1042);
      expect(o.paymentMethodId).toBe('whatsapp');
    });
  });
});
