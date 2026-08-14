import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { unwrap } from '../../core/supabase/supabase-error';
import { AdminUserRow, OrderStatus } from '../../core/supabase/database.types';
import { AdminUserModel } from '../models/release.model';
import { AdminOrderModel } from '../models/admin-order.model';
import {
  AdminNewsModel,
  AdminPartModel,
  AdminVehicleModel,
} from '../models/admin-inventory.model';
import {
  ADMIN_NEWS_MOCK,
  ADMIN_ORDERS_MOCK,
  ADMIN_PARTS_MOCK,
  ADMIN_USERS_MOCK,
  ADMIN_VEHICLES_MOCK,
} from '../data/admin.mock';

function toAdminUser(row: AdminUserRow): AdminUserModel {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone ?? undefined,
    location: row.location ?? undefined,
    isAdmin: row.is_admin,
    isVerified: row.is_verified,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Operaciones del panel de administración: usuarios y pedidos.
 *
 * Los usuarios **no** se leen con un select sobre `profiles`. Las políticas de
 * columna de la migración 0006 esconden `email` y `phone` a cualquier sesión del
 * navegador, admin incluido, porque los permisos de columna son por rol y no por
 * condición. La función `admin_list_users()` los devuelve tras comprobar
 * `is_admin` dentro de Postgres.
 *
 * Lo mismo con los permisos: `set_user_admin()` existe porque la política de
 * `profiles` solo deja editar tu propia fila y el trigger de 0005 congela
 * `is_admin`. Las dos funciones vuelven a validar quién llama, así que este
 * servicio no es la barrera de seguridad — es solo la puerta.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly supabase = inject(SupabaseService);

  private mockUsers: AdminUserModel[] = [...ADMIN_USERS_MOCK];
  private mockOrders: AdminOrderModel[] = [...ADMIN_ORDERS_MOCK];
  private mockParts: AdminPartModel[] = [...ADMIN_PARTS_MOCK];
  private mockVehicles: AdminVehicleModel[] = [...ADMIN_VEHICLES_MOCK];
  private mockNews: AdminNewsModel[] = [...ADMIN_NEWS_MOCK];

  // --- Usuarios ------------------------------------------------------------

  getUsers(): Observable<AdminUserModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...this.mockUsers]);
    }

    return from(this.supabase.db.rpc('admin_list_users')).pipe(
      map((res) => unwrap(res).map(toAdminUser)),
    );
  }

  /**
   * Da o quita el acceso de administrador.
   *
   * @param isVerified `null` deja la verificación como estaba.
   */
  setUserAdmin(
    userId: string,
    isAdmin: boolean,
    isVerified: boolean | null = null,
  ): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.mockUsers = this.mockUsers.map((u) =>
        u.id === userId
          ? { ...u, isAdmin, isVerified: isVerified ?? u.isVerified }
          : u,
      );
      return of(undefined);
    }

    return from(
      this.supabase.db.rpc('set_user_admin', {
        p_user_id: userId,
        p_is_admin: isAdmin,
        p_is_verified: isVerified,
      }),
    ).pipe(
      map((res) => {
        unwrap(res);
      }),
    );
  }

  // --- Pedidos -------------------------------------------------------------

  /**
   * Todos los pedidos con sus líneas. RLS ya limita esto a un admin
   * (`user_id = auth.uid() or is_admin()`), así que no hace falta filtrar aquí.
   */
  getOrders(): Observable<AdminOrderModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...this.mockOrders]);
    }

    return from(
      this.supabase.db
        .from('orders')
        .select('*, order_items(id, name, unit_price, quantity)')
        .order('created_at', { ascending: false }),
    ).pipe(
      map((res) =>
        unwrap(res).map((row) => ({
          id: row.id,
          contactEmail: row.contact_email,
          contactPhone: row.contact_phone ?? undefined,
          fullName: row.full_name,
          addressLine1: row.address_line1,
          city: row.city ?? undefined,
          shippingOptionId: row.shipping_option_id,
          paymentMethodId: row.payment_method_id,
          orderNotes: row.order_notes ?? undefined,
          subtotal: Number(row.subtotal),
          shippingPrice: Number(row.shipping_price),
          total: Number(row.total),
          status: row.status,
          isGuest: row.user_id === null,
          createdAt: new Date(row.created_at),
          items: (row.order_items ?? []).map((i) => ({
            id: i.id,
            name: i.name,
            unitPrice: Number(i.unit_price),
            quantity: i.quantity,
          })),
        })),
      ),
    );
  }

  // --- Inventario propio ---------------------------------------------------
  //
  // Estos listados piden **todo**, incluido lo desactivado, que es justo lo que
  // la app pública no muestra: la política de cada tabla lo permite porque
  // `select` es `using (is_active or public.is_admin())`.

  getInventoryParts(): Observable<AdminPartModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...this.mockParts]);
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .select('id, name, brand, category, price, stock, is_active')
        .order('name'),
    ).pipe(
      map((res) =>
        unwrap(res).map((r) => ({
          id: r.id,
          name: r.name,
          brand: r.brand,
          category: r.category,
          price: Number(r.price),
          stock: r.stock,
          isActive: r.is_active,
        })),
      ),
    );
  }

  updatePart(id: number, change: Partial<Pick<AdminPartModel, 'price' | 'stock' | 'isActive'>>): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.mockParts = this.mockParts.map((p) => (p.id === id ? { ...p, ...change } : p));
      return of(undefined);
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .update({
          ...(change.price !== undefined && { price: change.price }),
          ...(change.stock !== undefined && { stock: change.stock }),
          ...(change.isActive !== undefined && { is_active: change.isActive }),
        })
        .eq('id', id),
    ).pipe(
      map((res) => {
        unwrap(res);
      }),
    );
  }

  getInventoryVehicles(): Observable<AdminVehicleModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...this.mockVehicles]);
    }

    return from(
      this.supabase.db
        .from('auto_hub_vehicles')
        .select('id, brand, model, year, price, mileage, is_available')
        .order('created_at', { ascending: false }),
    ).pipe(
      map((res) =>
        unwrap(res).map((r) => ({
          id: r.id,
          brand: r.brand,
          model: r.model,
          year: r.year,
          price: Number(r.price),
          mileage: r.mileage,
          isAvailable: r.is_available,
        })),
      ),
    );
  }

  updateVehicle(
    id: number,
    change: Partial<Pick<AdminVehicleModel, 'price' | 'isAvailable'>>,
  ): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.mockVehicles = this.mockVehicles.map((v) => (v.id === id ? { ...v, ...change } : v));
      return of(undefined);
    }

    return from(
      this.supabase.db
        .from('auto_hub_vehicles')
        .update({
          ...(change.price !== undefined && { price: change.price }),
          ...(change.isAvailable !== undefined && { is_available: change.isAvailable }),
        })
        .eq('id', id),
    ).pipe(
      map((res) => {
        unwrap(res);
      }),
    );
  }

  getInventoryNews(): Observable<AdminNewsModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...this.mockNews]);
    }

    return from(
      this.supabase.db
        .from('news')
        .select('id, title, scope, published_at, is_published')
        .order('published_at', { ascending: false }),
    ).pipe(
      map((res) =>
        unwrap(res).map((r) => ({
          id: r.id,
          title: r.title,
          scope: r.scope,
          publishedAt: new Date(`${r.published_at}T12:00:00Z`),
          isPublished: r.is_published,
        })),
      ),
    );
  }

  updateNews(id: number, isPublished: boolean): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.mockNews = this.mockNews.map((n) => (n.id === id ? { ...n, isPublished } : n));
      return of(undefined);
    }

    return from(
      this.supabase.db.from('news').update({ is_published: isPublished }).eq('id', id),
    ).pipe(
      map((res) => {
        unwrap(res);
      }),
    );
  }

  /** Solo un admin puede cambiar el estado: lo exige la política de `orders`. */
  setOrderStatus(orderId: string, status: OrderStatus): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.mockOrders = this.mockOrders.map((o) =>
        o.id === orderId ? { ...o, status } : o,
      );
      return of(undefined);
    }

    return from(
      this.supabase.db.from('orders').update({ status }).eq('id', orderId),
    ).pipe(
      map((res) => {
        unwrap(res);
      }),
    );
  }
}
