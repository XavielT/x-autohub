import { ProductCategoryModel } from '../models/product.model';

/**
 * Las categorías de primer nivel de la tienda: la misma semilla que siembra
 * `supabase/migrations/0017_store_catalog.sql`, en el mismo orden. Las hijas las
 * crea el admin, así que el mock no trae ninguna.
 *
 * El `icon` es el slug, como lo deja la migración 0041: el archivo es
 * `assets/icons/categories/<slug>.svg`.
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
    icon: slug,
    sortOrder: (index + 1) * 10,
    isActive: true,
  }),
);

// El mapeo de las 17 categorias de texto vive en un util: las paginas lo usan para
// los enlaces viejos y los componentes no pueden importar un mock.
export { LEGACY_CATEGORY_TO_SLUG } from '../utils/legacy-categories';
