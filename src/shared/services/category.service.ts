import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toProductCategory } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import { ProductCategoryModel, ProductCategoryNode } from '../models/product.model';
import { PRODUCT_CATEGORIES_MOCK } from '../data/product-category.mock';
import { buildCategoryTree } from '../utils/category-tree';

/**
 * Las categorías de la tienda: un árbol de dos niveles.
 *
 * Lectura pública de las **activas**. La gestión (crear, ordenar, desactivar)
 * vive en `AdminCatalogService`, que sí ve las inactivas.
 */
@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly supabase = inject(SupabaseService);

  /** Todas las categorías activas, planas y en orden. */
  getAll(): Observable<ProductCategoryModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(PRODUCT_CATEGORIES_MOCK.filter((c) => c.isActive));
    }

    return from(
      this.supabase.db
        .from('product_categories')
        .select('id, parent_id, slug, name, icon, sort_order, is_active, created_at')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toProductCategory)));
  }

  /** El árbol: cada categoría de primer nivel con sus hijas. Lo que pinta el menú. */
  getTree(): Observable<ProductCategoryNode[]> {
    return this.getAll().pipe(map(buildCategoryTree));
  }

  getBySlug(slug: string): Observable<ProductCategoryModel | undefined> {
    return this.getAll().pipe(map((all) => all.find((c) => c.slug === slug)));
  }
}
