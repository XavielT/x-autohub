import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toProduct, toProductFitment } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import {
  ProductFacets,
  ProductFitmentModel,
  ProductModel,
  ProductSearchParams,
  ProductSearchResult,
} from '../models/product.model';
import { SearchProductRow } from '../../core/supabase/database.types';
import { HUB_PART_MOCK } from '../data/hub-part.mock';
import { PRODUCT_FITMENTS_MOCK } from '../data/product-fitment.mock';
import { PRODUCT_CATEGORIES_MOCK } from '../data/product-category.mock';
import { AuthService } from './auth.service';
import { visibleTo } from '../utils/test-visibility';
import { searchProductsInMemory } from '../utils/product-search';

/**
 * Las columnas de `hub_parts` que la tienda lee. Se piden por nombre y no con
 * `select('*')` porque la tabla tiene `search_vector`, una columna generada que
 * solo sirve a Postgres y que nadie quiere descargar por producto.
 */
// Una sola cadena literal: supabase-js deduce el tipo de la fila leyendo el texto
// del select, y una concatenación ('a' + 'b') se ensancha a `string` y lo rompe.
const PRODUCT_COLUMNS =
  'id, category, category_id, slug, sku, name, brand, short_description, img_url, images, stars_rating, price, compare_at_price, description, stock, is_active, is_test, is_featured, fulfillment, lead_time_days, fitment_type, installable, installation_service_id, specs, sold_count, created_at, updated_at';

/** Más reciente primero; a igual fecha, el de id mayor (el último que se cargó). */
function newestFirst(a: ProductModel, b: ProductModel): number {
  return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || b.id - a.id;
}

/**
 * Productos de la tienda (la tabla `hub_parts`, que no se renombró).
 *
 * Lectura pública; escritura solo admin (por el panel, ver `AdminService`).
 *
 * En modo real las piezas de prueba las esconde RLS (migración 0013) y aquí no
 * se vuelve a filtrar. En modo simulado no hay RLS, así que el filtro lo aplica
 * este servicio con el mismo predicado que usan los demás.
 */
@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /** El predicado de visibilidad de prueba para la sesión actual. */
  private get visible() {
    return visibleTo<ProductModel>(this.auth.user());
  }

  /** Los productos activos que la sesión puede ver, en modo mock. */
  private mockProducts(): ProductModel[] {
    return HUB_PART_MOCK.filter(this.visible);
  }

  /**
   * Búsqueda de la tienda: texto, categoría, vehículo, precio y stock.
   *
   * En modo real llama a `search_products()`, que lo resuelve en una consulta y
   * devuelve el total aparte de las filas de la página. En modo mock lo hace
   * `searchProductsInMemory()` con la misma semántica.
   */
  searchProducts(params: ProductSearchParams = {}): Observable<ProductSearchResult> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        searchProductsInMemory(
          this.mockProducts(),
          PRODUCT_FITMENTS_MOCK,
          PRODUCT_CATEGORIES_MOCK,
          params,
        ),
      );
    }

    return from(params.brand ? this.searchByBrand(params) : this.searchPage(params));
  }

  /** Una página de `search_products()`, ya traducida. */
  private async searchPage(params: ProductSearchParams): Promise<ProductSearchResult> {
    const rows = await this.rpcRows(params);
    return {
      items: rows.map(toProduct),
      // `total_count` es igual en todas las filas; sin filas no hay total.
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    };
  }

  private async rpcRows(params: ProductSearchParams): Promise<SearchProductRow[]> {
    const res = await this.supabase.db.rpc('search_products', {
      p_query: params.query ?? null,
      p_category_slug: params.categorySlug ?? null,
      p_make_id: params.makeId ?? null,
      p_model_id: params.modelId ?? null,
      p_year: params.year ?? null,
      p_min_price: params.minPrice ?? null,
      p_max_price: params.maxPrice ?? null,
      p_in_stock_only: params.inStockOnly ?? false,
      p_sort: params.sort ?? 'relevance',
      p_limit: params.limit ?? 24,
      p_offset: params.offset ?? 0,
    });
    return unwrap(res);
  }

  /**
   * Con filtro de marca.
   *
   * `search_products()` todavía no recibe la marca (la migración 0017 no la trae),
   * así que se trae todo lo que cumple los demás filtros —de a 100, que es lo que
   * la función entrega como máximo— y la marca se aplica aquí, con la misma
   * paginación y el mismo total que daría la base. Con un catálogo de cientos de
   * productos es una o dos llamadas; cuando crezca, el parámetro `p_brand` va en
   * la función y esto desaparece (ver ROADMAP).
   */
  private async searchByBrand(params: ProductSearchParams): Promise<ProductSearchResult> {
    const PAGE = 100;
    const all: SearchProductRow[] = [];

    for (let offset = 0; ; offset += PAGE) {
      const rows = await this.rpcRows({ ...params, brand: undefined, limit: PAGE, offset });
      all.push(...rows);
      if (rows.length < PAGE || all.length >= Number(rows[0].total_count)) break;
    }

    const filtered = all.filter((row) => row.brand === params.brand);
    const offset = Math.max(params.offset ?? 0, 0);
    const limit = Math.min(Math.max(params.limit ?? 24, 1), PAGE);
    return { items: filtered.slice(offset, offset + limit).map(toProduct), total: filtered.length };
  }

  /** Las marcas y el precio más alto del catálogo visible: lo que pintan los filtros. */
  getFacets(): Observable<ProductFacets> {
    const facets = (rows: { brand: string; price: number | string }[]): ProductFacets => ({
      brands: [...new Set(rows.map((r) => r.brand))].sort((a, b) => a.localeCompare(b, 'es')),
      maxPrice: rows.reduce((max, r) => Math.max(max, Number(r.price)), 0),
    });

    if (this.supabase.shouldUseMockData()) {
      return of(facets(this.mockProducts().filter((p) => p.isActive !== false)));
    }

    return from(this.supabase.db.from('hub_parts').select('brand, price').eq('is_active', true)).pipe(
      map((res) => facets(unwrap(res))),
    );
  }

  /**
   * La compatibilidad de varios productos de una sola vez: lo que necesita la
   * tienda para marcar con el check verde cada tarjeta que le sirve al vehículo
   * elegido, sin una consulta por tarjeta.
   */
  getFitmentsFor(productIds: readonly number[]): Observable<ProductFitmentModel[]> {
    if (productIds.length === 0) return of([]);

    if (this.supabase.shouldUseMockData()) {
      return of(PRODUCT_FITMENTS_MOCK.filter((f) => productIds.includes(f.productId)));
    }

    return from(
      this.supabase.db
        .from('product_fitments')
        .select('id, product_id, make_id, model_id, year_from, year_to')
        .in('product_id', [...productIds]),
    ).pipe(map((res) => unwrap(res).map(toProductFitment)));
  }

  /** Productos de la misma categoría, sin el actual: lo que va en "Relacionados". */
  getRelated(product: ProductModel, limit = 8): Observable<ProductModel[]> {
    if (product.categoryId === null) return of([]);

    if (this.supabase.shouldUseMockData()) {
      return of(
        this.mockProducts()
          .filter((p) => p.categoryId === product.categoryId && p.id !== product.id)
          .sort((a, b) => b.soldCount - a.soldCount || a.id - b.id)
          .slice(0, limit),
      );
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .select(PRODUCT_COLUMNS)
        .eq('is_active', true)
        .eq('category_id', product.categoryId)
        .neq('id', product.id)
        .order('sold_count', { ascending: false })
        .order('id', { ascending: true })
        .limit(limit),
    ).pipe(map((res) => unwrap(res).map(toProduct)));
  }

  /**
   * Productos con oferta (los que traen `compare_at_price`), los más recientes
   * primero. Es la tira "Ofertas" del home.
   */
  getOffers(limit = 12): Observable<ProductModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        this.mockProducts()
          .filter((p) => p.compareAtPrice !== null)
          .sort(newestFirst)
          .slice(0, limit),
      );
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .select(PRODUCT_COLUMNS)
        .eq('is_active', true)
        .not('compare_at_price', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit),
    ).pipe(map((res) => unwrap(res).map(toProduct)));
  }

  /** Los más vendidos (`sold_count`), de mayor a menor. */
  getBestSellers(limit = 8): Observable<ProductModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        this.mockProducts()
          .filter((p) => p.soldCount > 0)
          .sort((a, b) => b.soldCount - a.soldCount || a.id - b.id)
          .slice(0, limit),
      );
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .select(PRODUCT_COLUMNS)
        .eq('is_active', true)
        .gt('sold_count', 0)
        .order('sold_count', { ascending: false })
        .order('id', { ascending: true })
        .limit(limit),
    ).pipe(map((res) => unwrap(res).map(toProduct)));
  }

  /** Lo último que entró al catálogo (`created_at`). */
  getNewArrivals(limit = 8): Observable<ProductModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.mockProducts().sort(newestFirst).slice(0, limit));
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .select(PRODUCT_COLUMNS)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit),
    ).pipe(map((res) => unwrap(res).map(toProduct)));
  }

  getAll(): Observable<ProductModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.mockProducts());
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .select(PRODUCT_COLUMNS)
        .eq('is_active', true)
        .order('id', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toProduct)));
  }

  getById(id: number): Observable<ProductModel | undefined> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.mockProducts().find((p) => p.id === id));
    }

    return from(
      this.supabase.db.from('hub_parts').select(PRODUCT_COLUMNS).eq('id', id).maybeSingle(),
    ).pipe(map((res) => (res.data ? toProduct(res.data) : undefined)));
  }

  getBySlug(slug: string): Observable<ProductModel | undefined> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.mockProducts().find((p) => p.slug === slug));
    }

    return from(
      this.supabase.db.from('hub_parts').select(PRODUCT_COLUMNS).eq('slug', slug).maybeSingle(),
    ).pipe(map((res) => (res.data ? toProduct(res.data) : undefined)));
  }

  /** Por la categoría de texto de la tienda anterior. Se retira en la fase 7. */
  getByCategory(category: string): Observable<ProductModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.mockProducts().filter((p) => p.category === category));
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .select(PRODUCT_COLUMNS)
        .eq('category', category)
        .eq('is_active', true),
    ).pipe(map((res) => unwrap(res).map(toProduct)));
  }

  /**
   * Con qué vehículos declara servir un producto. Vacío para un `universal`, y
   * también para un `specific` al que nadie le cargó compatibilidad: en ese caso
   * la ficha dice "Consultar compatibilidad".
   */
  getFitments(productId: number): Observable<ProductFitmentModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(PRODUCT_FITMENTS_MOCK.filter((f) => f.productId === productId));
    }

    return from(
      this.supabase.db
        .from('product_fitments')
        .select('id, product_id, make_id, model_id, year_from, year_to')
        .eq('product_id', productId)
        .order('id', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toProductFitment)));
  }
}
