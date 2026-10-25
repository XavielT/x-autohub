import { AutoHubModel } from '../models/auto-hub.model';
import { HubMarketItemModel } from '../models/hub-market-item.model';
import { autoHubPath, autoHubSeo, hubMarketPath, hubMarketSeo } from './community-seo';

const AUTO: AutoHubModel = {
  id: 3,
  brand: 'Toyota',
  model: 'Corolla',
  year: 2020,
  price: 1250000,
  color: 'Gris',
  mileage: 45000,
  chasisType: 'sedan',
  doors: 4,
  traction: 'fwd',
  fuel: 'gasoline',
  cylinders: 4,
  images: ['assets/imgs/auto.jpg'],
  description: 'Un solo dueño, con todo al día.',
  location: 'Santo Domingo',
  contact: '8095550134',
};

const ITEM: HubMarketItemModel = {
  id: 7,
  title: 'Aros 17 pulgadas',
  description: 'Juego de cuatro aros en buen estado.',
  images: ['assets/imgs/aros.jpg'],
  price: 18500,
  location: 'Santiago',
  sellerName: 'Vendedor',
  category: 'accesorios',
};

describe('community-seo', () => {
  describe('Auto Hub', () => {
    it('la ruta de la ficha', () => {
      expect(autoHubPath(3)).toBe('/auto-hub-details/3');
    });

    it('el título lleva marca, modelo y año', () => {
      expect(autoHubSeo(AUTO).title).toBe('Toyota Corolla 2020 | Auto Hub — X AutoHub');
    });

    it('la descripción lleva lo que decide una compra, con el precio en RD$', () => {
      const { description } = autoHubSeo(AUTO);

      expect(description).toContain('45,000 KM');
      expect(description).toContain('gasolina');
      expect(description).toContain('Santo Domingo');
      expect(description).toContain('RD$ 1,250,000');
      expect(description).toContain('verificado por X AutoHub');
    });

    it('la descripción no pasa de 155 caracteres', () => {
      const { description } = autoHubSeo({ ...AUTO, description: 'x '.repeat(400) });

      expect(description.length).toBeLessThanOrEqual(155);
      expect(description.endsWith('…')).toBe(true);
    });

    it('la imagen es la primera, y la ruta la de la ficha', () => {
      const page = autoHubSeo(AUTO);

      expect(page.image).toBe('assets/imgs/auto.jpg');
      expect(page.path).toBe('/auto-hub-details/3');
    });

    it('sin fotos no inventa una (SeoService cae en la del sitio)', () => {
      expect(autoHubSeo({ ...AUTO, images: [] }).image).toBeUndefined();
    });
  });

  describe('Hub Market', () => {
    it('la ruta depende de la categoría, no de la que traiga guardada el contenido sembrado', () => {
      expect(hubMarketPath({ id: 1, category: 'vehiculos' })).toBe('/car-details/1');
      expect(hubMarketPath({ id: 2, category: 'piezas' })).toBe('/hub-market-part-details/2');
      expect(hubMarketPath({ id: 3, category: 'accesorios' })).toBe('/accessory-details/3');
      expect(hubMarketSeo({ ...ITEM, detailRoute: '/hub-part-details/9', category: 'piezas', id: 9 }).path).toBe(
        '/hub-market-part-details/9',
      );
    });

    it('título, descripción e imagen salen de la publicación', () => {
      const page = hubMarketSeo(ITEM);

      expect(page.title).toBe('Aros 17 pulgadas | Hub Market — X AutoHub');
      expect(page.description).toContain('Santiago');
      expect(page.description).toContain('RD$ 18,500');
      expect(page.description).toContain('Juego de cuatro aros');
      expect(page.image).toBe('assets/imgs/aros.jpg');
      expect(page.path).toBe('/accessory-details/7');
    });

    it('una descripción vacía no deja un hueco', () => {
      expect(hubMarketSeo({ ...ITEM, description: '' }).description).toBe('Aros 17 pulgadas. Santiago · RD$ 18,500.');
    });
  });
});
