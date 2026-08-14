import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { unwrap } from '../../core/supabase/supabase-error';
import { AdminUserRow, OrderStatus } from '../../core/supabase/database.types';
import { AdminUserModel } from '../models/release.model';
import { AdminOrderModel } from '../models/admin-order.model';
import {
  AdminNewsModel,
  AdminPartModel,
  AdminVehicleModel,
  EditableNews,
  EditablePart,
  EditableVehicle,
  NewNewsDraft,
  NewPartDraft,
  NewVehicleDraft,
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

  // --- Altas del inventario ------------------------------------------------
  //
  // Los tres insert dependen de que RLS deje escribir solo a `is_admin`, así que
  // un cliente manipulado no puede meter una pieza al catálogo. Las columnas con
  // default (`stars_rating`, `created_at`) no se envían: las pone Postgres.

  createPart(draft: NewPartDraft): Observable<AdminPartModel> {
    if (this.supabase.shouldUseMockData()) {
      const created: AdminPartModel = {
        id: Math.max(0, ...this.mockParts.map((p) => p.id)) + 1,
        name: draft.name,
        brand: draft.brand,
        category: draft.category,
        price: draft.price,
        stock: draft.stock,
        isActive: draft.isActive,
      };
      this.mockParts = [created, ...this.mockParts];
      return of(created);
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .insert({
          category: draft.category.trim(),
          name: draft.name.trim(),
          brand: draft.brand.trim(),
          img_url: draft.imgUrl,
          images: draft.images,
          price: draft.price,
          description: draft.description.trim(),
          stock: draft.stock,
          is_active: draft.isActive,
        })
        .select('id, name, brand, category, price, stock, is_active')
        .single(),
    ).pipe(
      map((res) => {
        const r = unwrap(res);
        return {
          id: r.id,
          name: r.name,
          brand: r.brand,
          category: r.category,
          price: Number(r.price),
          stock: r.stock,
          isActive: r.is_active,
        };
      }),
    );
  }

  createVehicle(draft: NewVehicleDraft): Observable<AdminVehicleModel> {
    if (this.supabase.shouldUseMockData()) {
      const created: AdminVehicleModel = {
        id: Math.max(0, ...this.mockVehicles.map((v) => v.id)) + 1,
        brand: draft.brand,
        model: draft.model,
        year: draft.year,
        price: draft.price,
        mileage: draft.mileage,
        isAvailable: draft.isAvailable,
      };
      this.mockVehicles = [created, ...this.mockVehicles];
      return of(created);
    }

    return from(
      this.supabase.db
        .from('auto_hub_vehicles')
        .insert({
          brand: draft.brand.trim(),
          model: draft.model.trim(),
          year: draft.year,
          price: draft.price,
          color: draft.color.trim(),
          mileage: draft.mileage,
          chasis_type: draft.chasisType,
          doors: draft.doors,
          traction: draft.traction,
          fuel: draft.fuel,
          cylinders: draft.cylinders,
          images: draft.images,
          description: draft.description.trim(),
          location: draft.location.trim(),
          contact: draft.contact.trim(),
          is_available: draft.isAvailable,
        })
        .select('id, brand, model, year, price, mileage, is_available')
        .single(),
    ).pipe(
      map((res) => {
        const r = unwrap(res);
        return {
          id: r.id,
          brand: r.brand,
          model: r.model,
          year: r.year,
          price: Number(r.price),
          mileage: r.mileage,
          isAvailable: r.is_available,
        };
      }),
    );
  }

  createNews(draft: NewNewsDraft): Observable<AdminNewsModel> {
    if (this.supabase.shouldUseMockData()) {
      const created: AdminNewsModel = {
        id: Math.max(0, ...this.mockNews.map((n) => n.id)) + 1,
        title: draft.title,
        scope: draft.scope,
        publishedAt: new Date(`${draft.publishedAt}T12:00:00Z`),
        isPublished: draft.isPublished,
      };
      this.mockNews = [created, ...this.mockNews];
      return of(created);
    }

    return from(
      this.supabase.db
        .from('news')
        .insert({
          title: draft.title.trim(),
          text: draft.text.trim(),
          text_large: draft.textLarge.trim(),
          image_url: draft.imageUrl,
          images: draft.images,
          scope: draft.scope,
          author: draft.author?.trim() || null,
          published_at: draft.publishedAt,
          is_published: draft.isPublished,
        })
        .select('id, title, scope, published_at, is_published')
        .single(),
    ).pipe(
      map((res) => {
        const r = unwrap(res);
        return {
          id: r.id,
          title: r.title,
          scope: r.scope,
          publishedAt: new Date(`${r.published_at}T12:00:00Z`),
          isPublished: r.is_published,
        };
      }),
    );
  }

  // --- Edicion completa ----------------------------------------------------
  //
  // Los listados del panel traen una vista reducida (lo justo para la tabla).
  // Para editar hace falta la fila entera, así que se pide aparte al abrir el
  // formulario: es una sola fila y evita cargar descripciones y arreglos de
  // imágenes de decenas de artículos que nadie va a editar.

  getPart(id: number): Observable<EditablePart> {
    if (this.supabase.shouldUseMockData()) {
      const p = this.mockParts.find((x) => x.id === id);
      if (!p) return throwError(() => new Error('No encontramos esa pieza.'));
      return of({
        ...p,
        imgUrl: '',
        images: [],
        description: '',
        isActive: p.isActive,
      });
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .select('id, category, name, brand, img_url, images, price, description, stock, is_active')
        .eq('id', id)
        .single(),
    ).pipe(
      map((res) => {
        const r = unwrap(res);
        return {
          id: r.id,
          category: r.category,
          name: r.name,
          brand: r.brand,
          imgUrl: r.img_url,
          images: r.images ?? [],
          price: Number(r.price),
          description: r.description,
          stock: r.stock,
          isActive: r.is_active,
        };
      }),
    );
  }

  updatePartFull(id: number, draft: NewPartDraft): Observable<AdminPartModel> {
    if (this.supabase.shouldUseMockData()) {
      const updated: AdminPartModel = {
        id,
        name: draft.name,
        brand: draft.brand,
        category: draft.category,
        price: draft.price,
        stock: draft.stock,
        isActive: draft.isActive,
      };
      this.mockParts = this.mockParts.map((p) => (p.id === id ? updated : p));
      return of(updated);
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .update({
          category: draft.category.trim(),
          name: draft.name.trim(),
          brand: draft.brand.trim(),
          img_url: draft.imgUrl,
          images: draft.images,
          price: draft.price,
          description: draft.description.trim(),
          stock: draft.stock,
          is_active: draft.isActive,
        })
        .eq('id', id)
        .select('id, name, brand, category, price, stock, is_active')
        .single(),
    ).pipe(
      map((res) => {
        const r = unwrap(res);
        return {
          id: r.id,
          name: r.name,
          brand: r.brand,
          category: r.category,
          price: Number(r.price),
          stock: r.stock,
          isActive: r.is_active,
        };
      }),
    );
  }

  getVehicle(id: number): Observable<EditableVehicle> {
    if (this.supabase.shouldUseMockData()) {
      const v = this.mockVehicles.find((x) => x.id === id);
      if (!v) return throwError(() => new Error('No encontramos ese vehiculo.'));
      return of({
        ...v,
        color: '',
        chasisType: 'sedan',
        doors: 4,
        traction: 'fwd',
        fuel: 'gasoline',
        cylinders: 4,
        images: [],
        description: '',
        location: '',
        contact: '',
      });
    }

    return from(
      this.supabase.db.from('auto_hub_vehicles').select('*').eq('id', id).single(),
    ).pipe(
      map((res) => {
        const r = unwrap(res);
        return {
          id: r.id,
          brand: r.brand,
          model: r.model,
          year: r.year,
          price: Number(r.price),
          color: r.color,
          mileage: r.mileage,
          chasisType: r.chasis_type,
          doors: r.doors,
          traction: r.traction,
          fuel: r.fuel,
          cylinders: r.cylinders,
          images: r.images ?? [],
          description: r.description,
          location: r.location,
          contact: r.contact,
          isAvailable: r.is_available,
        };
      }),
    );
  }

  updateVehicleFull(id: number, draft: NewVehicleDraft): Observable<AdminVehicleModel> {
    if (this.supabase.shouldUseMockData()) {
      const updated: AdminVehicleModel = {
        id,
        brand: draft.brand,
        model: draft.model,
        year: draft.year,
        price: draft.price,
        mileage: draft.mileage,
        isAvailable: draft.isAvailable,
      };
      this.mockVehicles = this.mockVehicles.map((v) => (v.id === id ? updated : v));
      return of(updated);
    }

    return from(
      this.supabase.db
        .from('auto_hub_vehicles')
        .update({
          brand: draft.brand.trim(),
          model: draft.model.trim(),
          year: draft.year,
          price: draft.price,
          color: draft.color.trim(),
          mileage: draft.mileage,
          chasis_type: draft.chasisType,
          doors: draft.doors,
          traction: draft.traction,
          fuel: draft.fuel,
          cylinders: draft.cylinders,
          images: draft.images,
          description: draft.description.trim(),
          location: draft.location.trim(),
          contact: draft.contact.trim(),
          is_available: draft.isAvailable,
        })
        .eq('id', id)
        .select('id, brand, model, year, price, mileage, is_available')
        .single(),
    ).pipe(
      map((res) => {
        const r = unwrap(res);
        return {
          id: r.id,
          brand: r.brand,
          model: r.model,
          year: r.year,
          price: Number(r.price),
          mileage: r.mileage,
          isAvailable: r.is_available,
        };
      }),
    );
  }

  getNews(id: number): Observable<EditableNews> {
    if (this.supabase.shouldUseMockData()) {
      const n = this.mockNews.find((x) => x.id === id);
      if (!n) return throwError(() => new Error('No encontramos esa noticia.'));
      return of({
        id: n.id,
        title: n.title,
        text: '',
        textLarge: '',
        imageUrl: '',
        images: [],
        scope: n.scope,
        author: undefined,
        publishedAt: n.publishedAt.toISOString().slice(0, 10),
        isPublished: n.isPublished,
      });
    }

    return from(this.supabase.db.from('news').select('*').eq('id', id).single()).pipe(
      map((res) => {
        const r = unwrap(res);
        return {
          id: r.id,
          title: r.title,
          text: r.text,
          textLarge: r.text_large,
          imageUrl: r.image_url,
          images: r.images ?? [],
          scope: r.scope,
          author: r.author ?? undefined,
          publishedAt: r.published_at,
          isPublished: r.is_published,
        };
      }),
    );
  }

  updateNewsFull(id: number, draft: NewNewsDraft): Observable<AdminNewsModel> {
    if (this.supabase.shouldUseMockData()) {
      const updated: AdminNewsModel = {
        id,
        title: draft.title,
        scope: draft.scope,
        publishedAt: new Date(`${draft.publishedAt}T12:00:00Z`),
        isPublished: draft.isPublished,
      };
      this.mockNews = this.mockNews.map((n) => (n.id === id ? updated : n));
      return of(updated);
    }

    return from(
      this.supabase.db
        .from('news')
        .update({
          title: draft.title.trim(),
          text: draft.text.trim(),
          text_large: draft.textLarge.trim(),
          image_url: draft.imageUrl,
          images: draft.images,
          scope: draft.scope,
          author: draft.author?.trim() || null,
          published_at: draft.publishedAt,
          is_published: draft.isPublished,
        })
        .eq('id', id)
        .select('id, title, scope, published_at, is_published')
        .single(),
    ).pipe(
      map((res) => {
        const r = unwrap(res);
        return {
          id: r.id,
          title: r.title,
          scope: r.scope,
          publishedAt: new Date(`${r.published_at}T12:00:00Z`),
          isPublished: r.is_published,
        };
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
