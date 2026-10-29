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
import { AuthService } from './auth.service';
import { visibleTo } from '../utils/test-visibility';
import { Lifecycle, isLive, newExpiry } from '../utils/publication-lifecycle';

/**
 * Hub Market: los clasificados que publica la comunidad.
 *
 * Lectura pública; cada usuario solo puede insertar/editar/borrar lo suyo — la
 * política RLS obliga a que `seller_id = auth.uid()`, así que ni siquiera un
 * cliente manipulado puede publicar en nombre de otro.
 *
 * El `select` incluye el perfil del vendedor para que el nombre salga siempre del
 * perfil actual y no de una copia vieja.
 *
 * **El nombre de la clave foránea es obligatorio, no decoración.** Desde la
 * migración 0012 esta tabla apunta a `profiles` **dos veces** —`seller_id` y
 * `reviewed_by`— y con dos caminos PostgREST no adivina cuál se quiere: responde
 * `PGRST201` y la consulta entera falla. Sin el `!hub_market_items_seller_id_fkey`
 * no se ve **nada** en Hub Market.
 *
 * Es un fallo que ningún modo de desarrollo enseña: con mocks no hay PostgREST, y
 * corriendo el SQL a mano tampoco, porque la ambigüedad la resuelve PostgREST y no
 * Postgres. Solo aparece contra la base real. Si algún día se agrega otra columna
 * que referencie `profiles`, esto sigue funcionando — por eso se nombra la clave
 * en vez de confiar en que solo haya una.
 */
/**
 * Se exporta **solo para que una prueba pueda vigilarlo**. Es la unica defensa
 * automatica posible: el fallo que cubre no se reproduce ni con mocks ni
 * corriendo el SQL a mano, porque lo decide PostgREST.
 */
export const SELECT_WITH_SELLER = '*, profiles!hub_market_items_seller_id_fkey(display_name)';

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
  private readonly auth = inject(AuthService);

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
    return this.visible(items).filter((item) => statusOf(item) === 'aprobado' && isLive(item));
  }

  /**
   * Quita lo que esta sesión no puede ver por estar marcado como de prueba.
   *
   * **Solo para el modo simulado**, igual que en los otros servicios: en modo
   * real lo hace RLS (0013) antes de que la fila salga de Postgres. Se aplica
   * también a `getBySellerId` y a `getPending` a propósito, para que el modo
   * simulado se comporte exactamente como la política —que mete el filtro de
   * prueba bajo un `and` sobre sus tres ramas, la del dueño incluida.
   */
  private visible(items: HubMarketItemModel[]): HubMarketItemModel[] {
    return items.filter(visibleTo<HubMarketItemModel>(this.auth.user()));
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
        .is('sold_at', null)
        .gt('expires_at', new Date().toISOString())
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
      return of(this.visible(this.mockItems).find((item) => item.id === id));
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
        .is('sold_at', null)
        .gt('expires_at', new Date().toISOString())
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
        .is('sold_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit),
    ).pipe(map((res) => unwrap(res).map(toHubMarketItem)));
  }

  /**
   * Los últimos vehículos aprobados, más reciente primero. Es la fila de
   * "Vehículos" del home: a diferencia de `getFeaturedVehicles`, no da
   * prioridad a los destacados, porque ahí se enseña lo que acaba de salir.
   */
  getLatestVehicles(limit = 3): Observable<HubMarketItemModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        this.approvedOnly(this.mockItems.filter((item) => item.category === 'vehiculos'))
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id - a.id)
          .slice(0, limit),
      );
    }

    return from(
      this.supabase.db
        .from('hub_market_items')
        .select(SELECT_WITH_SELLER)
        .eq('category', 'vehiculos')
        .eq('is_active', true)
        .eq('status', 'aprobado')
        .is('sold_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(limit),
    ).pipe(map((res) => unwrap(res).map(toHubMarketItem)));
  }

  /**
   * Búsqueda por título en lo que publica la comunidad. Es la mitad de abajo de
   * `/buscar` ("De la comunidad"): la tienda oficial va arriba y esto va aparte,
   * porque no es lo mismo comprarle a X AutoHub que a un particular.
   *
   * Sin acentos ni mayúsculas, y solo lo aprobado y activo, como los listados.
   */
  search(query: string, limit = 12): Observable<HubMarketItemModel[]> {
    const text = query.trim();
    if (!text) return of([]);

    if (this.supabase.shouldUseMockData()) {
      const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const needle = fold(text);
      return of(
        this.approvedOnly(this.mockItems)
          .filter((item) => fold(item.title).includes(needle))
          .slice(0, limit),
      );
    }

    // `%`, `_` y la barra invertida son comodines de ilike: se escapan para que
    // "100%" busque "100%" y no "100 y lo que sea".
    const escaped = text.replace(/[\\%_]/g, (c) => `\\${c}`);
    return from(
      this.supabase.db
        .from('hub_market_items')
        .select(SELECT_WITH_SELLER)
        .ilike('title', `%${escaped}%`)
        .eq('is_active', true)
        .eq('status', 'aprobado')
        .is('sold_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(limit),
    ).pipe(map((res) => unwrap(res).map(toHubMarketItem)));
  }

  /** Publicaciones del usuario indicado, incluidas las despublicadas. */
  getBySeller(sellerId: string): Observable<HubMarketItemModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.visible(this.mockItems).filter((item) => item.sellerId === sellerId));
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
        this.visible(this.mockItems)
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
        soldAt: undefined,
        expiresAt: newExpiry(),
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

  // --- Ciclo de vida: vendida y renovar ------------------------------------

  /**
   * Marca una publicación como vendida: sale de los listados, del sitemap y del próximo despliegue, y
   * su ficha queda con un aviso. Va por `mark_publication_sold()` (0030) y no por un `update`: las
   * fechas las pone el reloj de la base y un trigger las congela en cualquier otro update.
   */
  markSold(id: number): Observable<Lifecycle | undefined> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.patchMock(id, (item) => ({ ...item, soldAt: item.soldAt ?? new Date().toISOString() })));
    }

    return from(this.supabase.db.rpc('mark_publication_sold', { p_id: id })).pipe(
      map((res) => this.applyLifecycle(unwrap(res)[0])),
    );
  }

  /** Renueva una publicación 60 días más, y si estaba vendida la vuelve a poner a la venta. */
  renew(id: number): Observable<Lifecycle | undefined> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.patchMock(id, (item) => ({ ...item, soldAt: undefined, expiresAt: newExpiry() })));
    }

    return from(this.supabase.db.rpc('renew_publication', { p_id: id })).pipe(
      map((res) => this.applyLifecycle(unwrap(res)[0])),
    );
  }

  /** Cambia una publicación del mock y la devuelve (o `undefined` si no existe). */
  private patchMock(
    id: number,
    change: (item: HubMarketItemModel) => HubMarketItemModel,
  ): HubMarketItemModel | undefined {
    this.mockItems = this.mockItems.map((item) => (item.id === id ? change(item) : item));
    return this.mockItems.find((item) => item.id === id);
  }

  /**
   * Las dos funciones devuelven solo las fechas nuevas; el resto de la publicación no cambió, así que se
   * deja a quien llama mezclarlas con lo que ya tiene en pantalla.
   */
  private applyLifecycle(
    row: { sold_at: string | null; expires_at: string } | undefined,
  ): Lifecycle | undefined {
    if (!row) return undefined;
    return { soldAt: row.sold_at ?? undefined, expiresAt: row.expires_at };
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
        this.visible(this.mockItems)
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
          () => new Error('Explica en al menos 10 caracteres por qué se rechaza.'),
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

  /**
   * Marca o desmarca una publicación como de prueba.
   *
   * Va por un `update` normal y **no** por una función, al revés que
   * `moderate()`: aquí no hay transición que dejar consistente —ni motivo, ni
   * quién revisó, ni cuándo— así que una `security definer` sería ceremonia sin
   * contenido. La barrera está donde tiene que estar: el trigger
   * `freeze_publication_moderation` (0013) devuelve la columna a su valor
   * anterior si quien escribe no modera, porque RLS no sabe filtrar columnas.
   */
  setTestFlag(id: number, isTest: boolean): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.mockItems = this.mockItems.map((item) =>
        item.id === id ? { ...item, isTest } : item,
      );
      return of(undefined);
    }

    return from(
      this.supabase.db.from('hub_market_items').update({ is_test: isTest }).eq('id', id),
    ).pipe(
      map((res) => {
        if (res.error) unwrap(res as { data: null; error: typeof res.error });
        return undefined;
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
