/**
 * Modelos de la tienda (pivote de octubre de 2026, fase 1).
 *
 * `ProductModel` es la pieza o accesorio de la tienda propia. Vive en la tabla
 * `hub_parts`, que no se renombró (ver `supabase/migrations/0017_store_catalog.sql`);
 * el mapper hace la traducción. `HubPartModel` sigue existiendo como alias
 * deprecado para no romper imports mientras el resto del código migra.
 */

/** De inventario propio o bajo pedido (dropshipping). */
export type ProductFulfillment = 'stock' | 'on_order';

/**
 * `universal` sirve para cualquier vehículo; `specific` solo para los que
 * declaran sus `ProductFitmentModel`. Un `specific` sin fitments cargados se
 * muestra como "Consultar compatibilidad", nunca como compatible.
 */
export type ProductFitmentType = 'universal' | 'specific';

export interface ProductModel {
  id: number;
  /** Categoría de texto de la tienda anterior al pivote. Se elimina en la fase 7. */
  category: string;
  /** Categoría del árbol nuevo. Nula en filas que aún no se han clasificado. */
  categoryId: number | null;
  slug: string;
  sku: string;
  name: string;
  brand: string;
  shortDescription: string;
  imgUrl: string;
  images?: string[];
  starsRating: number;
  price: number;
  /** Precio anterior. Nulo = sin oferta; si existe, es mayor que `price`. */
  compareAtPrice: number | null;
  description: string;
  /** Unidades en inventario propio. Solo cuenta cuando `fulfillment` es `stock`. */
  stock: number;
  isFeatured: boolean;
  fulfillment: ProductFulfillment;
  /** Días de entrega. Obligatorio cuando `fulfillment` es `on_order`. */
  leadTimeDays: number | null;
  fitmentType: ProductFitmentType;
  installable: boolean;
  installationServiceId: number | null;
  /** Especificaciones como pares clave/valor. jsonb no conserva el orden de carga. */
  specs: Record<string, string>;
  soldCount: number;
  /** Artículo de prueba. Ver `shared/utils/test-visibility.ts`. */
  isTest?: boolean;
  /** Solo lo ven el admin y quien consulta el panel; la tienda siempre filtra activos. */
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Una categoría del árbol. Dos niveles como máximo. */
export interface ProductCategoryModel {
  id: number;
  /** Nulo = primer nivel. */
  parentId: number | null;
  slug: string;
  name: string;
  /** Clave de icono. Nula hasta que la fase 2 decida la iconografía. */
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Una categoría de primer nivel con sus hijas ya colgadas. */
export interface ProductCategoryNode extends ProductCategoryModel {
  children: ProductCategoryModel[];
}

export interface VehicleMakeModel {
  id: number;
  name: string;
  slug: string;
}

export interface VehicleModelModel {
  id: number;
  makeId: number;
  name: string;
  slug: string;
}

/** "Este producto sirve para esta marca [y modelo] [entre estos años]". */
export interface ProductFitmentModel {
  id: number;
  productId: number;
  makeId: number;
  /** Nulo = toda la marca. */
  modelId: number | null;
  /** Nulo = sin límite inferior. */
  yearFrom: number | null;
  /** Nulo = sin límite superior. */
  yearTo: number | null;
}

/** Un vehículo del garaje de un usuario. */
export interface ProfileVehicleModel {
  id: number;
  userId: string;
  makeId: number;
  modelId: number;
  year: number;
  nickname: string | null;
  isDefault: boolean;
}

/** El vehículo que el visitante eligió para filtrar la tienda. */
export interface SelectedVehicle {
  makeId: number;
  modelId: number;
  year: number;
}

export type ProductSort = 'relevance' | 'price_asc' | 'price_desc' | 'best_sellers' | 'newest';

/** Los filtros de `searchProducts()`. Todos opcionales. */
export interface ProductSearchParams {
  query?: string;
  /** Marca del producto, tal como está escrita. */
  brand?: string;
  categorySlug?: string;
  makeId?: number;
  modelId?: number;
  year?: number;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sort?: ProductSort;
  limit?: number;
  offset?: number;
}

/** Lo que la tienda necesita para pintar sus filtros: las marcas y el precio más alto. */
export interface ProductFacets {
  brands: string[];
  maxPrice: number;
}

export interface ProductSearchResult {
  items: ProductModel[];
  /** Coincidencias totales antes de paginar. */
  total: number;
}
