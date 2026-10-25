import { AutoHubModel } from '../models/auto-hub.model';
import { HubMarketCategory, HubMarketItemModel } from '../models/hub-market-item.model';
import { SeoPage } from '../services/seo.service';

/** Una descripción de buscador cabe en ~155 caracteres. */
const MAX_DESCRIPTION = 155;

const FUEL_LABEL: Record<AutoHubModel['fuel'], string> = {
  gasoline: 'gasolina',
  diesel: 'diésel',
  glp: 'GLP',
  electric: 'eléctrico',
};

/** `1250000` → `1,250,000`. A mano: no depende de que el servidor traiga los datos de idioma. */
function grouped(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const money = (value: number): string => `RD$ ${grouped(value)}`;

function clip(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_DESCRIPTION ? `${clean.slice(0, MAX_DESCRIPTION - 3).trimEnd()}…` : clean;
}

/** La ruta de la ficha de un vehículo de Auto Hub. */
export function autoHubPath(id: number): string {
  return `/auto-hub-details/${id}`;
}

/**
 * La ruta de la ficha de una publicación de Hub Market, según su categoría. Es la misma que arma
 * `detailRouteFor()` al leer de la base; aquí se recalcula porque el contenido sembrado trae rutas viejas.
 */
export function hubMarketPath(item: Pick<HubMarketItemModel, 'id' | 'category'>): string {
  return hubMarketPathFor(item.category, item.id);
}

export function hubMarketPathFor(category: HubMarketCategory, id: number): string {
  switch (category) {
    case 'vehiculos':
      return `/car-details/${id}`;
    case 'piezas':
      return `/hub-market-part-details/${id}`;
    case 'accesorios':
      return `/accessory-details/${id}`;
  }
}

/**
 * Lo que los buscadores y la vista previa de WhatsApp leen de un vehículo de Auto Hub: marca, modelo y
 * año en el título, y en la descripción lo que decide una compra (kilometraje, combustible, dónde está,
 * cuánto cuesta). Un vehículo de prueba nunca se anuncia: no devuelve nada.
 */
export function autoHubSeo(auto: AutoHubModel): SeoPage {
  const name = `${auto.brand} ${auto.model} ${auto.year}`;
  const facts = [
    `${grouped(auto.mileage)} KM`,
    FUEL_LABEL[auto.fuel] ?? auto.fuel,
    auto.location,
    money(auto.price),
  ].filter(Boolean);

  return {
    title: `${name} | Auto Hub — X AutoHub`,
    description: clip([`${name}, verificado por X AutoHub.`, `${facts.join(' · ')}.`, auto.description].join(' ')),
    path: autoHubPath(auto.id),
    image: auto.images?.[0],
  };
}

/** Lo mismo para una publicación de la comunidad en Hub Market. */
export function hubMarketSeo(item: HubMarketItemModel): SeoPage {
  const facts = [item.location, money(item.price)].filter(Boolean);

  return {
    title: `${item.title} | Hub Market — X AutoHub`,
    description: clip([`${item.title}.`, `${facts.join(' · ')}.`, item.description].join(' ')),
    path: hubMarketPath(item),
    image: item.images?.[0],
  };
}
