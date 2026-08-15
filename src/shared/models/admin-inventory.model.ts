import {
  ChasisType,
  FuelType,
  NewsScope,
  TractionType,
} from '../../core/supabase/database.types';

/**
 * Vistas reducidas del inventario propio para el panel.
 *
 * A propósito no son los modelos completos (`HubPartModel`, `AutoHubModel`): el
 * listado de administración solo necesita identificar cada fila y los campos que
 * se ajustan a diario. Traer las 17 columnas de un vehículo para pintar una
 * tabla sería gastar ancho de banda en datos que nadie mira.
 */
export interface AdminPartModel {
  id: number;
  name: string;
  brand: string;
  category: string;
  price: number;
  stock: number;
  isActive: boolean;
  /**
   * Artículo de prueba (migración 0013).
   *
   * En el panel **no** es opcional, al revés que en los modelos públicos: aquí
   * siempre se lee de la fila, y un `undefined` significaría "no se sabe" en la
   * única pantalla donde el dato tiene que estar claro.
   */
  isTest: boolean;
}

export interface AdminVehicleModel {
  id: number;
  brand: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  isAvailable: boolean;
  isTest: boolean;
}

export interface AdminNewsModel {
  id: number;
  title: string;
  scope: NewsScope;
  publishedAt: Date;
  isPublished: boolean;
  isTest: boolean;
}

// --- Altas -----------------------------------------------------------------
//
// Lo que los formularios del panel envían para crear un artículo nuevo. Solo
// llevan lo que la base exige más lo que de verdad se llena a mano: el resto de
// las columnas tienen default en el esquema (`stars_rating`, `is_active`,
// `created_at`) y se dejan decidir a Postgres.
//
// Las imágenes llegan ya subidas, como URLs públicas: el componente las sube
// primero con `StorageService.uploadInventoryImages()` y solo entonces inserta.
// Al revés quedaría una fila apuntando a fotos que no existen.

export interface NewPartDraft {
  category: string;
  name: string;
  brand: string;
  /** Portada. Es la primera de las imágenes subidas. */
  imgUrl: string;
  images: string[];
  price: number;
  description: string;
  stock: number;
  isActive: boolean;
  isTest: boolean;
}

export interface NewVehicleDraft {
  brand: string;
  model: string;
  year: number;
  price: number;
  color: string;
  mileage: number;
  chasisType: ChasisType;
  doors: number;
  traction: TractionType;
  fuel: FuelType;
  cylinders: number;
  images: string[];
  description: string;
  location: string;
  /** Teléfono de contacto, como texto: un 809 con formato no es un número. */
  contact: string;
  isAvailable: boolean;
  isTest: boolean;
}

export interface NewNewsDraft {
  title: string;
  /** Entradilla que se ve en la tarjeta. */
  text: string;
  /** Cuerpo completo de la noticia. */
  textLarge: string;
  imageUrl: string;
  images: string[];
  scope: NewsScope;
  author?: string;
  publishedAt: string;
  isPublished: boolean;
  isTest: boolean;
}

// --- Ediciones --------------------------------------------------------------
//
// El mismo contenido del borrador más el `id`. Se reusa la forma en vez de
// declarar tipos aparte porque los campos editables son exactamente los mismos
// que los del alta: cualquier campo nuevo entra en los dos lados a la vez y no
// se puede olvidar uno.
//
// `images` llega con las URLs que la fila ya tiene. El formulario decide cuáles
// conservar, y el componente sube las nuevas antes de guardar.

export type EditablePart = NewPartDraft & { id: number };
export type EditableVehicle = NewVehicleDraft & { id: number };
export type EditableNews = NewNewsDraft & { id: number };

/** Opciones de los enums, con etiqueta en español para los selectores. */
export const CHASIS_OPTIONS: readonly { value: ChasisType; label: string }[] = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'pickup', label: 'Pickup' },
];

export const TRACTION_OPTIONS: readonly { value: TractionType; label: string }[] = [
  { value: 'fwd', label: 'Delantera (FWD)' },
  { value: 'rwd', label: 'Trasera (RWD)' },
  { value: 'awd', label: 'Integral (AWD)' },
  { value: '4x4', label: '4x4' },
];

export const FUEL_OPTIONS: readonly { value: FuelType; label: string }[] = [
  { value: 'gasoline', label: 'Gasolina' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'glp', label: 'GLP' },
  { value: 'electric', label: 'Electrico' },
];

export const SCOPE_OPTIONS: readonly { value: NewsScope; label: string }[] = [
  { value: 'local', label: 'Local' },
  { value: 'internacional', label: 'Internacional' },
];

/**
 * Categorías del catálogo.
 *
 * `hub_parts.category` es `text` y no un enum, así que la base acepta cualquier
 * cosa. Esta lista es la que ya existe en los datos: se ofrece para que no
 * aparezcan variantes como "Frenos" y "frenos" conviviendo, pero el campo deja
 * escribir una nueva.
 */
export const PART_CATEGORIES: readonly string[] = [
  'aceites', 'audio', 'bateria', 'detailing', 'electrico', 'escape', 'exterior',
  'filtros', 'frenos', 'herramientas', 'interior', 'llantas', 'luces', 'motor',
  'refrigeracion', 'suspension', 'transmision',
];
