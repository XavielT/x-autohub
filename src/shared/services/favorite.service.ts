import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, of, switchMap } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { translateDbError } from '../../core/supabase/supabase-error';
import { ProductModel } from '../models/product.model';
import { AuthService } from './auth.service';
import { ProductService } from './product.service';
import { ToastService } from './toast.service';

/**
 * Los productos que una persona con cuenta guardó (`favorites`, migración 0038).
 *
 * Sin sesión no hay favoritos: `toggle()` avisa que hay que entrar. En modo simulado viven en
 * memoria (no hay tabla) y se pierden al cerrar sesión, igual que el garaje.
 *
 * `ids` es lo que usan los corazones de las tarjetas: se lee una vez al iniciar sesión y se
 * actualiza al instante al tocar uno (si la base lo rechaza, se deshace).
 */
@Injectable({ providedIn: 'root' })
export class FavoriteService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly products = inject(ProductService);
  private readonly toast = inject(ToastService);

  private readonly _ids = signal<readonly number[]>([]);
  /** Los ids guardados, del más nuevo al más viejo. */
  readonly ids = this._ids.asReadonly();
  readonly count = computed(() => this._ids().length);

  private readonly _loaded = signal(false);
  /** Ya se leyeron los favoritos de esta sesión (o no hay nada que leer). Antes, una lista vacía no quiere decir "sin favoritos". */
  readonly loaded = this._loaded.asReadonly();
  private readonly idSet = computed(() => new Set(this._ids()));

  /** Productos con un cambio en vuelo, para que dos toques seguidos no se pisen. */
  private readonly pending = new Set<number>();

  constructor() {
    effect(() => {
      const user = this.auth.user();
      untracked(() => this.load(user?.id ?? null));
    });
  }

  isFavorite(partId: number): boolean {
    return this.idSet().has(partId);
  }

  /** Guarda o quita un producto. Devuelve si quedó guardado. */
  toggle(partId: number): Observable<boolean> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.toast.show('Inicia sesion para guardar tus favoritos.', 'error');
      return of(false);
    }
    if (this.pending.has(partId)) return of(this.isFavorite(partId));

    const adding = !this.isFavorite(partId);
    this.setLocal(partId, adding);
    if (this.supabase.shouldUseMockData()) return of(adding);

    this.pending.add(partId);
    const query = adding
      ? this.supabase.db.from('favorites').insert({ user_id: userId, part_id: partId })
      : this.supabase.db.from('favorites').delete().eq('user_id', userId).eq('part_id', partId);

    return new Observable<boolean>((subscriber) => {
      const undo = (message: string) => {
        this.pending.delete(partId);
        this.setLocal(partId, !adding);
        this.toast.show(message, 'error');
        subscriber.next(!adding);
        subscriber.complete();
      };
      // Un rechazo de red no puede dejar el corazón a medias ni el producto "en vuelo" para siempre.
      Promise.resolve(query).then(
        (res) => {
          if (res.error) return undo(translateDbError(res.error));
          this.pending.delete(partId);
          subscriber.next(adding);
          subscriber.complete();
        },
        () => undo('No pudimos actualizar tus favoritos. Revisa tu conexion.'),
      );
    });
  }

  /** Los productos guardados, completos, del más nuevo al más viejo. Los que ya no se ven no vienen. */
  list(): Observable<ProductModel[]> {
    return of(this._ids()).pipe(switchMap((ids) => this.products.getByIds(ids)));
  }

  private setLocal(partId: number, saved: boolean): void {
    this._ids.update((ids) => {
      const rest = ids.filter((id) => id !== partId);
      return saved ? [partId, ...rest] : rest;
    });
  }

  private load(userId: string | null): void {
    this._ids.set([]);
    this._loaded.set(false);
    if (!userId || this.supabase.shouldUseMockData()) {
      this._loaded.set(true);
      return;
    }

    this.supabase.db
      .from('favorites')
      .select('part_id')
      .order('created_at', { ascending: false })
      .then((res) => {
        // La sesión pudo cambiar mientras la consulta volvía.
        if (this.auth.user()?.id !== userId) return;
        if (!res.error) this._ids.set((res.data ?? []).map((row) => row.part_id));
        this._loaded.set(true);
      });
  }
}
