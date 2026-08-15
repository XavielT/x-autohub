import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { fromHubMarketItem, toHubMarketItem } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import {
  HubMarketCategory,
  HubMarketItemModel,
  PublicationStatus,
} from '../models/hub-market-item.model';
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

/**
 * Estado de una publicación, tratando la ausencia como aprobada.
 *
 * El contenido sembrado y los mocks anteriores a la fase 5 no traen `status`.
 * Sin este default, un `item.status === 'aprobado'` los escondería a todos y
 * Hub Market se vería vacío en modo simulado.
 */
function statusOf(item: HubMarketItemModel): PublicationStatus {
  return item.status ?? 'aprobado';
}

@Injectable({ providedIn: 'root' })
export class HubMarketService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Copia propia del mock. Sin esto, `publish()` y `deactivate()` mutarían la
   * constante importada: el resto de la app (y las pruebas) verían artículos
   * que nunca se publicaron.
   */
  private mockItems: HubMarketItemModel[] = [...HUB_MARKET_ITEMS_MOCK];

  /**
   * Los listados públicos filtran por `aprobado` **en los dos modos**.
   *
   * En modo real RLS ya lo hace para un usuario normal, pero no para quien
   * modera: su política le deja ver todo, así que sin este filtro un moderador
   * navegando el sitio público vería las publicaciones pendientes mezcladas con
   * las aprobadas, y no sabría que está viendo algo que nadie más ve.
   */
  private approvedOnly(items: HubMarketItemModel[]): HubMarketItemModel[] {
    return items.filter((item) => statusOf(item) === 'aprobado');
  }

  getAll(): Observable<HubMarketItemModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.approvedOnly(this.mockItems));
    }

    return from(
      this.supabase.db
        .from('hub_market_items')
        .select(SELECT_WITH_SELLER)
        .eq('is_active', true)
        .eq('status', 'aprobado')
        .order('created_at', { ascending: false }),
    ).pipe(map((res) => unwrap(res).map(toHubMarketItem)));
  }

  /**
   * Una publicación por id.
   *
   * **No filtra por estado**: de esto viven las páginas de detalle, y su dueño
   * tiene que poder abrir la suya mientras está pendiente (llega ahí desde
   * /perfil). Quien no sea el dueño ni modere no la recibe de todos modos —
   * la política de select de 0012 se la esconde.
   */
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
      return of(this.approvedOnly(this.mockItems.filter((item) => item.category === category)));
    }

    return from(
      this.supabase.db
        .from('hub_market_items')
        .select(SELECT_WITH_SELLER)
        .eq('category', category)
        .eq('is_active', true)
        .eq('status', 'aprobado')
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
      return of(this.pickFeatured(this.approvedOnly(this.mockItems), limit));
    }

    return from(
      this.supabase.db
        .from('hub_market_items')
        .select(SELECT_WITH_SELLER)
        .eq('category', 'vehiculos')
        .eq('is_active', true)
        .eq('status', 'aprobado')
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
   * Trae **todas**, en cualquier estado: es su propia lista, y a su dueño le
   * sirve ver también lo que dio de baja, lo que espera revisión y lo que le
   * rechazaron con su motivo. La política de select de 0012 lo permite —
   * `seller_id = auth.uid()` es una de sus tres ramas.
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

  /**
   * Publica un artículo.
   *
   * @param canModerate Si quien publica es moderador o admin, en cuyo caso la
   *   publicación sale aprobada: no tiene sentido que se aprueben a sí mismos
   *   pasando por la cola.
   *
   *   **En modo real este valor no decide nada.** El estado lo pone el trigger
   *   `hub_market_force_status` (0012) preguntándole a Postgres quién está
   *   publicando; aquí solo sirve para el modo simulado, que no tiene triggers.
   *   Un cliente manipulado que mande `true` no consigue nada.
   */
  publish(
    item: Omit<HubMarketItemModel, 'id'>,
    sellerId: string,
    sellerName: string,
    canModerate = false,
  ): Observable<HubMarketItemModel> {
    if (this.supabase.shouldUseMockData()) {
      const created: HubMarketItemModel = {
        ...item,
        id: Math.max(0, ...this.mockItems.map((i) => i.id)) + 1,
        sellerId,
        sellerName,
        status: canModerate ? 'aprobado' : 'pendiente',
        rejectionReason: undefined,
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

  // --- Moderación ----------------------------------------------------------

  /**
   * La cola de revisión: lo que espera decisión, de lo más viejo a lo más nuevo.
   *
   * El orden es ascendente a propósito, al revés que el resto de los listados:
   * una cola se atiende por antigüedad, y quien publicó primero es quien lleva
   * más tiempo esperando.
   *
   * En modo real la política de select solo le devuelve esto a quien modera; a
   * un usuario normal le llega una lista vacía, no un error.
   */
  getPending(): Observable<HubMarketItemModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        this.mockItems
          .filter((item) => statusOf(item) === 'pendiente')
          .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
      );
    }

    return from(
      this.supabase.db
        .from('hub_market_items')
        .select(SELECT_WITH_SELLER)
        .eq('status', 'pendiente')
        .order('created_at', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toHubMarketItem)));
  }

  /**
   * Aprueba o rechaza una publicación.
   *
   * Va por la función `moderate_publication()` y no por un `update`: el trigger
   * de 0012 congela `status` y compañía en cualquier update normal, así que la
   * función es el único camino — y además deja la fila entera consistente
   * (estado, motivo, quién revisó y cuándo) en una sola transacción.
   *
   * @param reason Obligatorio al rechazar. Postgres lo vuelve a exigir y pide un
   *   mínimo de 10 caracteres, así que la validación del formulario es
   *   comodidad, no la barrera.
   */
  moderate(
    id: number,
    decision: 'aprobado' | 'rechazado',
    reason?: string,
  ): Observable<void> {
    const cleanReason = reason?.trim() || undefined;

    if (this.supabase.shouldUseMockData()) {
      if (decision === 'rechazado' && (cleanReason?.length ?? 0) < 10) {
        return throwError(
          () => new Error('Explica en al menos 10 caracteres por que se rechaza.'),
        );
      }

      this.mockItems = this.mockItems.map((item) =>
        item.id === id
          ? {
              ...item,
              status: decision,
              // Al aprobar se limpia: si no, el motivo de un rechazo anterior
              // se quedaría colgando de una publicación ya aprobada.
              rejectionReason: decision === 'rechazado' ? cleanReason : undefined,
            }
          : item,
      );
      return of(undefined);
    }

    return from(
      this.supabase.db.rpc('moderate_publication', {
        p_id: id,
        p_decision: decision,
        p_reason: cleanReason ?? null,
      }),
    ).pipe(
      map((res) => {
        unwrap(res);
      }),
    );
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
