import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, map, of, switchMap, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toProductCategory, toVehicleMake, toVehicleModel } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import {
  CategoryChange,
  FitmentDraft,
  NewCategoryDraft,
} from '../models/admin-inventory.model';
import {
  ProductCategoryModel,
  VehicleMakeModel,
  VehicleModelModel,
} from '../models/product.model';
import { PRODUCT_CATEGORIES_MOCK } from '../data/product-category.mock';
import { PRODUCT_FITMENTS_MOCK } from '../data/product-fitment.mock';
import { VEHICLE_MAKES_MOCK, VEHICLE_MODELS_MOCK } from '../data/vehicle.mock';
import { slugify } from '../utils/slugify';

/**
 * Gestión de la tienda desde el panel: categorías, marcas y modelos, y la
 * compatibilidad de cada producto.
 *
 * Todo esto es de **escritura solo admin**: las políticas de la migración 0017
 * usan `public.is_admin()`, así que este servicio no es la barrera de seguridad,
 * solo la puerta. Las lecturas públicas están en `CategoryService`,
 * `VehicleService` y `ProductService`.
 *
 * En modo mock el estado vive en memoria y no se comparte con los servicios
 * públicos (igual que el resto del panel): sirve para trabajar la interfaz.
 */
@Injectable({ providedIn: 'root' })
export class AdminCatalogService {
  private readonly supabase = inject(SupabaseService);

  private mockCategories: ProductCategoryModel[] = PRODUCT_CATEGORIES_MOCK.map((c) => ({ ...c }));
  private mockMakes: VehicleMakeModel[] = [...VEHICLE_MAKES_MOCK];
  private mockModels: VehicleModelModel[] = [...VEHICLE_MODELS_MOCK];
  /** Fitments por producto, en modo mock. */
  private mockFitments = new Map<number, FitmentDraft[]>();

  // --- Categorías ----------------------------------------------------------------

  /** Todas, **incluidas las desactivadas**, que es justo lo que el sitio no muestra. */
  getCategories(): Observable<ProductCategoryModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.mockCategories.map((c) => ({ ...c })));
    }

    return from(
      this.supabase.db
        .from('product_categories')
        .select('id, parent_id, slug, name, icon, sort_order, is_active, created_at')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toProductCategory)));
  }

  createCategory(draft: NewCategoryDraft): Observable<ProductCategoryModel> {
    const slug = draft.slug?.trim() || slugify(draft.name);

    if (this.supabase.shouldUseMockData()) {
      const problem = this.mockCategoryProblem(draft.parentId, slug);
      if (problem) return throwError(() => new Error(problem));

      const created: ProductCategoryModel = {
        id: Math.max(0, ...this.mockCategories.map((c) => c.id)) + 1,
        parentId: draft.parentId,
        slug,
        name: draft.name.trim(),
        icon: null,
        sortOrder: draft.sortOrder,
        isActive: true,
      };
      this.mockCategories = [...this.mockCategories, created];
      return of({ ...created });
    }

    return from(
      this.supabase.db
        .from('product_categories')
        .insert({
          slug,
          name: draft.name.trim(),
          parent_id: draft.parentId,
          sort_order: draft.sortOrder,
        })
        .select('id, parent_id, slug, name, icon, sort_order, is_active, created_at')
        .single(),
    ).pipe(map((res) => toProductCategory(unwrap(res))));
  }

  updateCategory(id: number, change: CategoryChange): Observable<ProductCategoryModel> {
    if (this.supabase.shouldUseMockData()) {
      const current = this.mockCategories.find((c) => c.id === id);
      if (!current) return throwError(() => new Error('No encontramos esa categoria.'));

      const next = { ...current, ...change };
      const problem =
        change.parentId !== undefined || change.slug !== undefined
          ? this.mockCategoryProblem(next.parentId, next.slug, id)
          : null;
      if (problem) return throwError(() => new Error(problem));

      this.mockCategories = this.mockCategories.map((c) => (c.id === id ? next : c));
      return of({ ...next });
    }

    return from(
      this.supabase.db
        .from('product_categories')
        .update({
          ...(change.name !== undefined && { name: change.name.trim() }),
          ...(change.slug !== undefined && { slug: change.slug.trim() }),
          ...(change.parentId !== undefined && { parent_id: change.parentId }),
          ...(change.sortOrder !== undefined && { sort_order: change.sortOrder }),
          ...(change.isActive !== undefined && { is_active: change.isActive }),
        })
        .eq('id', id)
        .select('id, parent_id, slug, name, icon, sort_order, is_active, created_at')
        .single(),
    ).pipe(map((res) => toProductCategory(unwrap(res))));
  }

  /**
   * Intercambia el orden de dos categorías hermanas. Es lo que hacen los botones
   * de subir y bajar: dos escrituras, y si la segunda falla el orden queda como
   * estaba salvo por una categoría, que el admin puede volver a mover.
   */
  swapCategoryOrder(a: ProductCategoryModel, b: ProductCategoryModel): Observable<void> {
    // Dos categorías con el mismo orden no se mueven con un intercambio: se
    // separan una unidad para que el cambio se note.
    const aOrder = a.sortOrder === b.sortOrder ? b.sortOrder + 1 : b.sortOrder;
    return forkJoin([
      this.updateCategory(a.id, { sortOrder: aOrder }),
      this.updateCategory(b.id, { sortOrder: a.sortOrder }),
    ]).pipe(map(() => undefined));
  }

  /** Las reglas que en la base hacen la unicidad y el trigger de dos niveles. */
  private mockCategoryProblem(parentId: number | null, slug: string, selfId?: number): string | null {
    if (!slug) return 'La categoria necesita un nombre.';
    if (this.mockCategories.some((c) => c.slug === slug && c.id !== selfId)) {
      return 'Ese registro ya existe.';
    }
    if (parentId !== null) {
      const parent = this.mockCategories.find((c) => c.id === parentId);
      if (parent && parent.parentId !== null) {
        return 'Las categorias admiten dos niveles como maximo.';
      }
      if (selfId !== undefined && this.mockCategories.some((c) => c.parentId === selfId)) {
        return 'Una categoria con subcategorias no puede ser subcategoria.';
      }
    }
    return null;
  }

  // --- Marcas y modelos -------------------------------------------------------------

  createMake(name: string): Observable<VehicleMakeModel> {
    const slug = slugify(name);
    if (!slug) return throwError(() => new Error('La marca necesita un nombre.'));

    if (this.supabase.shouldUseMockData()) {
      if (this.mockMakes.some((m) => m.slug === slug)) {
        return throwError(() => new Error('Ese registro ya existe.'));
      }
      const created: VehicleMakeModel = {
        id: Math.max(0, ...this.mockMakes.map((m) => m.id)) + 1,
        name: name.trim(),
        slug,
      };
      this.mockMakes = [...this.mockMakes, created];
      return of(created);
    }

    return from(
      this.supabase.db
        .from('vehicle_makes')
        .insert({ name: name.trim(), slug })
        .select('id, name, slug')
        .single(),
    ).pipe(map((res) => toVehicleMake(unwrap(res))));
  }

  createModel(makeId: number, name: string): Observable<VehicleModelModel> {
    const slug = slugify(name);
    if (!slug) return throwError(() => new Error('El modelo necesita un nombre.'));

    if (this.supabase.shouldUseMockData()) {
      if (this.mockModels.some((m) => m.makeId === makeId && m.slug === slug)) {
        return throwError(() => new Error('Ese registro ya existe.'));
      }
      const created: VehicleModelModel = {
        id: Math.max(0, ...this.mockModels.map((m) => m.id)) + 1,
        makeId,
        name: name.trim(),
        slug,
      };
      this.mockModels = [...this.mockModels, created];
      return of(created);
    }

    return from(
      this.supabase.db
        .from('vehicle_models')
        .insert({ make_id: makeId, name: name.trim(), slug })
        .select('id, make_id, name, slug')
        .single(),
    ).pipe(map((res) => toVehicleModel(unwrap(res))));
  }

  // --- Compatibilidad ------------------------------------------------------------------

  /** La compatibilidad de un producto, tal como la edita el formulario. */
  getFitments(productId: number): Observable<FitmentDraft[]> {
    if (this.supabase.shouldUseMockData()) {
      const edited = this.mockFitments.get(productId);
      if (edited) return of(edited.map((f) => ({ ...f })));
      return of(
        PRODUCT_FITMENTS_MOCK.filter((f) => f.productId === productId).map((f) => ({
          makeId: f.makeId,
          modelId: f.modelId,
          yearFrom: f.yearFrom,
          yearTo: f.yearTo,
        })),
      );
    }

    return from(
      this.supabase.db
        .from('product_fitments')
        .select('make_id, model_id, year_from, year_to')
        .eq('product_id', productId)
        .order('id', { ascending: true }),
    ).pipe(
      map((res) =>
        unwrap(res).map((f) => ({
          makeId: f.make_id,
          modelId: f.model_id,
          yearFrom: f.year_from,
          yearTo: f.year_to,
        })),
      ),
    );
  }

  /**
   * Reemplaza **toda** la compatibilidad de un producto por la lista dada.
   *
   * Borra y vuelve a insertar en vez de calcular qué cambió: la lista es corta
   * (decenas de filas como mucho) y así el resultado es exactamente lo que dice
   * el formulario, sin importar cómo se llegó a él. Son dos escrituras y no una
   * transacción; si la segunda falla el producto queda sin compatibilidad hasta
   * que se vuelva a guardar, y por eso el error lo dice claro.
   *
   * Los duplicados exactos se quitan antes: la base los rechaza (índice único) y
   * un fitment repetido no aporta nada.
   */
  replaceFitments(productId: number, fitments: readonly FitmentDraft[]): Observable<void> {
    const unique = dedupeFitments(fitments);

    if (this.supabase.shouldUseMockData()) {
      this.mockFitments.set(productId, unique);
      return of(undefined);
    }

    const insertRows = unique.map((f) => ({
      product_id: productId,
      make_id: f.makeId,
      model_id: f.modelId,
      year_from: f.yearFrom,
      year_to: f.yearTo,
    }));

    return from(
      this.supabase.db.from('product_fitments').delete().eq('product_id', productId),
    ).pipe(
      switchMap((deleted) => {
        if (deleted.error) {
          unwrap({ data: null, error: deleted.error });
        }
        if (insertRows.length === 0) return of(undefined);
        return from(this.supabase.db.from('product_fitments').insert(insertRows)).pipe(
          map((inserted) => {
            if (inserted.error) {
              console.error('[supabase]', inserted.error);
              throw new Error(
                'La pieza se guardo, pero su compatibilidad no. Vuelve a guardarla para reintentar.',
              );
            }
          }),
        );
      }),
      map(() => undefined),
    );
  }
}

/** Quita las filas de compatibilidad idénticas, conservando el orden. */
export function dedupeFitments(fitments: readonly FitmentDraft[]): FitmentDraft[] {
  const seen = new Set<string>();
  const result: FitmentDraft[] = [];
  for (const f of fitments) {
    const key = [f.makeId, f.modelId ?? '', f.yearFrom ?? '', f.yearTo ?? ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...f });
  }
  return result;
}
