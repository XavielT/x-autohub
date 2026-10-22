import { ProductCategoryModel } from '../models/product.model';

/**
 * Las categorías de primer nivel de la tienda: la misma semilla que siembra
 * `supabase/migrations/0017_store_catalog.sql`, en el mismo orden. Las hijas las
 * crea el admin, así que el mock no trae ninguna.
 *
 * El `icon` queda nulo: hoy no hay assets de categorías y no se referencia uno
 * que no existe (TODO de la fase 2, cuando se decida la iconografía).
 */
const FIRST_LEVEL: readonly [slug: string, name: string][] = [
  ['accesorios-interior', 'Accesorios interior'],
  ['accesorios-exterior', 'Accesorios exterior'],
  ['iluminacion', 'Iluminación'],
  ['audio-multimedia', 'Audio y multimedia'],
  ['llantas-aros', 'Llantas y aros'],
  ['frenos', 'Frenos'],
  ['suspension', 'Suspensión'],
  ['motor-filtros', 'Motor y filtros'],
  ['electrico-baterias', 'Eléctrico y baterías'],
  ['aire-acondicionado', 'Aire acondicionado'],
  ['limpieza-detailing', 'Limpieza y detailing'],
  ['herramientas-emergencia', 'Herramientas y emergencia'],
];

export const PRODUCT_CATEGORIES_MOCK: ProductCategoryModel[] = FIRST_LEVEL.map(
  ([slug, name], index) => ({
    id: index + 1,
    parentId: null,
    slug,
    name,
    icon: null,
    sortOrder: (index + 1) * 10,
    isActive: true,
  }),
);

/**
 * Cómo se mapean las 17 categorías de texto de la tienda anterior a las del
 * árbol nuevo. Es el mismo mapeo que hace la migración 0017 sobre las filas que
 * ya existen; si cambia uno, cambia el otro.
 */
export const LEGACY_CATEGORY_TO_SLUG: Readonly<Record<string, string>> = {
  interior: 'accesorios-interior',
  exterior: 'accesorios-exterior',
  luces: 'iluminacion',
  audio: 'audio-multimedia',
  llantas: 'llantas-aros',
  frenos: 'frenos',
  suspension: 'suspension',
  motor: 'motor-filtros',
  filtros: 'motor-filtros',
  aceites: 'motor-filtros',
  escape: 'motor-filtros',
  transmision: 'motor-filtros',
  // Radiador, intercooler, termostato: enfriar el motor, no aire acondicionado.
  refrigeracion: 'motor-filtros',
  electrico: 'electrico-baterias',
  bateria: 'electrico-baterias',
  detailing: 'limpieza-detailing',
  herramientas: 'herramientas-emergencia',
};
