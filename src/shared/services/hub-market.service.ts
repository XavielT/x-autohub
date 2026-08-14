import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { fromHubMarketItem, toHubMarketItem } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import { HubMarketCategory, HubMarketItemModel } from '../models/hub-market-item.model';
import { HUB_MARKET_ITEMS_MOCK } from '../data/hub-market-item.mock';

/**
 * Hub Market: los clasificados que publica la comunidad.
 *
 * Lectura pública; cada usuario solo puede insertar/editar/borrar lo suyo — la
 * política RLS obliga a que `seller_id = auth.uid()`, así que ni siquiera un
 * cliente manipulado puede publicar en nombre de otro.
 *
 * El `select` incluye `profiles(display_name)` para que el nombre del vendedor
 * salga siempre del perfil actual y no de una copia vieja.
 */
const SELECT_WITH_SELLER = '*, profiles(display_name)';

@Injectable({ providedIn: 'root' })
export class HubMarketService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Copia propia del mock. Sin esto, `publish()` y `deactivate()` mutarían la
   * constante importada: el resto de la app (y las pruebas) verían artículos
   * que nunca se publicaron.
   */
  private mockItems: HubMarketItemModel[] = [...HUB_MARKET_ITEMS_MOCK];

  getAll(): Observable<HubMarketItemModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...this.mockItems]);
    }

    return from(
      this.supabase.db
        .from('hub_market_items')
        .select(SELECT_WITH_SELLER)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ).pipe(map((res) => unwrap(res).map(toHubMarketItem)));
  }

  getById(id: number): Observable<HubMarketItemModel | undefined> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.mockItems.find((item) => item.id === id));
    }

    return from(
      this.supabase.db.from('hub_market_items').select(SELECT_WITH_SELLER).eq('id', id).maybeSingle(),
    ).pipe(map((res) => (res.data ? toHubMarketItem(res.data) : undefined)));
  }

  getByCategory(category: HubMarketCategory): Observable<HubMarketItemModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.mockItems.filter((item) => item.category === category));
    }

    return from(
      this.supabase.db
        .from('hub_market_items')
        .select(SELECT_WITH_SELLER)
        .eq('category', category)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ).pipe(map((res) => unwrap(res).map(toHubMarketItem)));
  }

  /**
   * Vehículos para la sección destacada del home.
   *
   * Pide los destacados y, si no llegan a `limit`, completa con los más
   * recientes. Es la misma regla que tenía la versión con mocks.
   */
  getFeaturedVehicles(limit = 3): Observable<HubMarketItemModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.pickFeatured(this.mockItems, limit));
    }

    return from(
      this.supabase.db
        .from('hub_market_items')
        .select(SELECT_WITH_SELLER)
        .eq('category', 'vehiculos')
        .eq('is_active', true)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit),
    ).pipe(map((res) => unwrap(res).map(toHubMarketItem)));
  }

  /** Publicaciones del usuario indicado, incluidas las despublicadas. */
  getBySeller(sellerId: string): Observable<HubMarketItemModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.mockItems.filter((item) => item.sellerId === sellerId));
    }

    return from(
      this.supabase.db
        .from('hub_market_items')
        .select(SELECT_WITH_SELLER)
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false }),
    ).pipe(map((res) => unwrap(res).map(toHubMarketItem)));
  }

  /**
   * Publica un artículo. Devuelve el artículo ya creado, con el id que asignó
   * la base de datos.
   */
  /**
   * Las publicaciones de un vendedor, de la mas nueva a la mas vieja.
   *
   * Trae **todas**, no solo las activas: es su propia lista, y a su dueño le
   * sirve ver también lo que dio de baja. RLS lo permite —
   * `using (is_active or seller_id = auth.uid() or is_admin())`.
   */
  getBySellerId(sellerId: string): Observable<HubMarketItemModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        this.mockItems
          .filter((item) => item.sellerId === sellerId)
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
      );
    }

    return from(
      this.supabase.db
        .from('hub_market_items')
        .select(SELECT_WITH_SELLER)
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false }),
    ).pipe(map((res) => unwrap(res).map(toHubMarketItem)));
  }

  publish(
    item: Omit<HubMarketItemModel, 'id'>,
    sellerId: string,
    sellerName: string,
  ): Observable<HubMarketItemModel> {
    if (this.supabase.shouldUseMockData()) {
      const created: HubMarketItemModel = {
        ...item,
        id: Math.max(0, ...this.mockItems.map((i) => i.id)) + 1,
        sellerId,
        sellerName,
        createdAt: new Date().toISOString(),
      };
      this.mockItems = [created, ...this.mockItems];
      return of(created);
    }

    return from(
      this.supabase.db
        .from('hub_market_items')
        .insert(fromHubMarketItem(item, sellerId, sellerName))
        .select(SELECT_WITH_SELLER)
        .single(),
    ).pipe(map((res) => toHubMarketItem(unwrap(res))));
  }

  /** Despublica sin borrar, para conservar el historial. */
  deactivate(id: number): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.mockItems = this.mockItems.filter((i) => i.id !== id);
      return of(undefined);
    }

    return from(
      this.supabase.db.from('hub_market_items').update({ is_active: false }).eq('id', id),
    ).pipe(
      map((res) => {
        if (res.error) unwrap(res as { data: null; error: typeof res.error });
        return undefined;
      }),
    );
  }

  private pickFeatured(items: HubMarketItemModel[], limit: number): HubMarketItemModel[] {
    const byDate = (a: HubMarketItemModel, b: HubMarketItemModel) =>
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();

    const vehicles = items.filter((i) => i.category === 'vehiculos' && i.vehicleSpecs);
    const featured = vehicles.filter((i) => i.isFeatured).sort(byDate);
    if (featured.length >= limit) return featured.slice(0, limit);

    const featuredIds = new Set(featured.map((f) => f.id));
    const rest = vehicles.filter((i) => !featuredIds.has(i.id)).sort(byDate);
    return [...featured, ...rest].slice(0, limit);
  }
}
