import {
  toAutoHubVehicle,
  toHubMarketItem,
  toHubPart,
  toNews,
  toSocialPost,
  fromHubMarketItem,
} from './mappers';
import { AutoHubVehicleRow, HubMarketItemRow, HubPartRow, NewsRow, SocialPostRow } from './database.types';

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
      spec_year: 1994,
      spec_mileage: 180000,
      spec_hp: 873,
      spec_zero_to_100: 3.8,
      spec_top_speed: 350,
      spec_brand: 'Toyota',
      spec_model: 'Supra',
      created_at: '2026-04-12T00:00:00Z',
    };

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

  describe('toHubPart', () => {
    const row: HubPartRow = {
      id: 1,
      category: 'frenos',
      name: 'Disco GTR',
      brand: 'Brembo',
      img_url: 'disco.jpg',
      images: [],
      stars_rating: 4.9,
      price: 12950,
      description: 'Alto rendimiento',
      stock: 25,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    };

    it('convierte la calificacion numerica a string, como espera la plantilla', () => {
      expect(toHubPart(row).starsRating).toBe(4.9);
    });

    it('deja images indefinido cuando el arreglo viene vacio', () => {
      expect(toHubPart(row).images).toBeUndefined();
      expect(toHubPart({ ...row, images: ['a.jpg'] }).images).toEqual(['a.jpg']);
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
});
