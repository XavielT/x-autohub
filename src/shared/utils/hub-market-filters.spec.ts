import { HubMarketItemModel } from '../models/hub-market-item.model';
import {
  EMPTY_HUB_MARKET_FILTERS, HubMarketFilters, activeHubMarketFilters, filterHubMarket, hubMarketFiltersFromParams, hubMarketFiltersToParams,
} from './hub-market-filters';
import { textMatchesQuery } from './search-synonyms';

const item = (id: number, over: Partial<HubMarketItemModel>): HubMarketItemModel => ({
  id, category: 'piezas', title: `Publicación ${id}`, description: '', images: [], price: 1000 * id, location: 'Santo Domingo', sellerName: 'Vendedor', ...over,
});

const ITEMS: HubMarketItemModel[] = [
  item(1, { category: 'vehiculos', title: 'Toyota Corolla 2015', location: 'Santiago', vehicleSpecs: { brand: 'Toyota' } as HubMarketItemModel['vehicleSpecs'] }),
  item(2, { category: 'accesorios', title: 'Parachoques deportivo', description: 'Para Civic' }),
  item(3, { title: 'Llantas 17 pulgadas', sellerName: 'Neumáticos Pérez' }),
];

const from = (query: string) => hubMarketFiltersFromParams((k) => new URLSearchParams(query).get(k));

describe('hub-market-filters', () => {
  it('sin filtros devuelve todo en su orden, y no cuenta filtros', () => {
    expect(filterHubMarket(ITEMS, EMPTY_HUB_MARKET_FILTERS).map((i) => i.id)).toEqual([1, 2, 3]);
    expect(activeHubMarketFilters(EMPTY_HUB_MARKET_FILTERS)).toBe(0);
  });

  it('el texto entiende sinónimos: "bumper" encuentra "Parachoques" y "goma" las llantas', () => {
    expect(filterHubMarket(ITEMS, { ...EMPTY_HUB_MARKET_FILTERS, query: 'bumper' }).map((i) => i.id)).toEqual([2]);
    expect(filterHubMarket(ITEMS, { ...EMPTY_HUB_MARKET_FILTERS, query: 'goma' }).map((i) => i.id)).toEqual([3]);
  });

  it('el texto sigue encontrando a medias, sin tildes y por vendedor', () => {
    expect(filterHubMarket(ITEMS, { ...EMPTY_HUB_MARKET_FILTERS, query: 'orolla' }).map((i) => i.id)).toEqual([1]);
    expect(filterHubMarket(ITEMS, { ...EMPTY_HUB_MARKET_FILTERS, query: 'neumaticos perez' }).map((i) => i.id)).toEqual([3]);
  });

  it('con varias palabras cada una tiene que estar, aunque no juntas', () => {
    expect(filterHubMarket(ITEMS, { ...EMPTY_HUB_MARKET_FILTERS, query: 'deportivo civic' }).map((i) => i.id)).toEqual([2]);
    expect(filterHubMarket(ITEMS, { ...EMPTY_HUB_MARKET_FILTERS, query: 'deportivo toyota' })).toEqual([]);
  });

  it('categoría, ubicación y marca filtran, y el precio ordena', () => {
    expect(filterHubMarket(ITEMS, { ...EMPTY_HUB_MARKET_FILTERS, category: 'vehiculos', brand: 'Toyota' }).map((i) => i.id)).toEqual([1]);
    expect(filterHubMarket(ITEMS, { ...EMPTY_HUB_MARKET_FILTERS, location: 'Santiago' }).map((i) => i.id)).toEqual([1]);
    expect(filterHubMarket(ITEMS, { ...EMPTY_HUB_MARKET_FILTERS, sort: 'precio-desc' }).map((i) => i.id)).toEqual([3, 2, 1]);
  });

  it('textMatchesQuery: una consulta vacía lo encuentra todo y una que no existe, nada', () => {
    expect(textMatchesQuery('lo que sea', '')).toBe(true);
    expect(textMatchesQuery('Parachoques', 'xqzvw')).toBe(false);
  });

  describe('la URL', () => {
    it('los filtros que ya son los de por defecto no ensucian el enlace', () => {
      expect(hubMarketFiltersToParams(EMPTY_HUB_MARKET_FILTERS)).toEqual({});
    });

    it('ida y vuelta', () => {
      const f: HubMarketFilters = { query: 'bumper', category: 'vehiculos', location: 'Santiago', brand: 'Toyota', sort: 'precio-asc' };
      const params = hubMarketFiltersToParams(f);
      expect(params).toEqual({ q: 'bumper', cat: 'vehiculos', ubic: 'Santiago', marca: 'Toyota', orden: 'precio-asc' });
      expect(from(new URLSearchParams(params).toString())).toEqual(f);
    });

    it('lo que viene de la URL no es de fiar: valores inválidos se descartan y el texto se recorta', () => {
      const f = from(`cat=hackeado&orden=otro&q=${'x'.repeat(200)}`);
      expect(f.category).toBe('all');
      expect(f.sort).toBe('recientes');
      expect(f.query).toHaveLength(60);
    });

    it('una marca fuera de Vehículos se ignora (el selector no existe ahí)', () => {
      expect(from('cat=piezas&marca=Toyota').brand).toBe('');
      expect(from('marca=Toyota').brand).toBe('');
    });
  });
});
