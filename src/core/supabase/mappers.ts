/**
 * Traducción entre las filas de Postgres (snake_case) y los modelos del
 * frontend (camelCase).
 *
 * Todo el mapeo vive aquí a propósito: los componentes siguen consumiendo los
 * mismos modelos que consumían con los mocks, y conectar Supabase no obligó a
 * tocar ni una plantilla.
 *
 * Si cambias una columna en supabase/migrations/, el cambio se propaga por
 * database.types.ts hasta acá y TypeScript te dice exactamente qué romper.
 */

import { AutoHubModel } from '../../shared/models/auto-hub.model';
import {
  ProductCategoryModel,
  ProductFitmentModel,
  ProductModel,
  ProfileVehicleModel,
  VehicleMakeModel,
  VehicleModelModel,
} from '../../shared/models/product.model';
import { HubMarketItemModel } from '../../shared/models/hub-market-item.model';
import { NewCardModel } from '../../shared/models/new-card.model';
import { ServiciosCardModel } from '../../shared/models/servicios-card.model';
import {
  SocialClubModel,
  SocialEventModel,
  SocialPostModel,
} from '../../shared/models/social-hub.model';
import {
  CheckoutPaymentMethodOption,
  CheckoutShippingOption,
} from '../../shared/models/checkout.model';
import { UserModel } from '../../shared/models/user.model';
import {
  AutoHubVehicleRow,
  HubMarketItemRow,
  HubPartRow,
  NewsRow,
  PaymentMethodRow,
  ProductCategoryRow,
  ProductFitmentRow,
  ProfileRow,
  ProfileVehicleRow,
  ServiceRow,
  ShippingOptionRow,
  SocialClubRow,
  SocialEventRow,
  SocialPostRow,
  VehicleMakeRow,
  VehicleModelRow,
} from './database.types';

/**
 * Columnas públicas del perfil.
 *
 * `email` y `phone` quedaron fuera del alcance de las claves anon y
 * authenticated en la migración 0006 (eran legibles por cualquiera). El correo
 * del usuario en sesión sale de Supabase Auth, que es su fuente autoritativa;
 * por eso `toUser` lo recibe aparte en vez de leerlo de la fila.
 */
export type PublicProfileRow = Omit<ProfileRow, 'email' | 'phone'>;

/**
 * @param email Siempre desde Supabase Auth, que es su fuente autoritativa:
 *   `profiles.email` lo escribe el trigger al registrarse y podría quedar
 *   desactualizado si alguien cambia su correo de acceso.
 * @param phone Solo llega cuando la fila viene de `get_my_profile()` (migración
 *   0009). Con un select normal la columna no es legible, así que queda
 *   `undefined` — y eso es lo correcto: nadie más que el dueño debe verlo.
 */
export function toUser(
  row: PublicProfileRow,
  email: string,
  phone?: string | null,
): UserModel {
  return {
    id: row.id,
    displayName: row.display_name,
    email,
    phone: phone ?? undefined,
    location: row.location ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    isVerified: row.is_verified,
    role: row.role,
    // Se deriva del rol y no se lee de `is_admin`, aunque la fila lo traiga: la
    // columna es un espejo de compatibilidad (0011) y `role` es la fuente de
    // verdad. Si algún día discreparan, manda el rol.
    isAdmin: row.role === 'admin',
    isTestUser: row.is_test_user,
    createdAt: row.created_at,
  };
}

export function toAutoHubVehicle(row: AutoHubVehicleRow): AutoHubModel {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    year: row.year,
    price: Number(row.price),
    color: row.color,
    mileage: row.mileage,
    chasisType: row.chasis_type,
    doors: row.doors,
    traction: row.traction,
    fuel: row.fuel,
    cylinders: row.cylinders,
    images: row.images ?? [],
    description: row.description,
    location: row.location,
    contact: row.contact,
    isTest: row.is_test,
  };
}

/**
 * Fila de `hub_parts` (o de `search_products()`, que trae las mismas columnas) a
 * `ProductModel`. El nombre de la tabla no cambió con el pivote; el del modelo sí.
 */
export function toProduct(row: Omit<HubPartRow, 'search_vector'>): ProductModel {
  return {
    id: row.id,
    category: row.category ?? '',
    categoryId: row.category_id,
    slug: row.slug,
    sku: row.sku,
    imgUrl: row.img_url,
    images: row.images?.length ? row.images : undefined,
    name: row.name,
    brand: row.brand,
    shortDescription: row.short_description,
    starsRating: Number(row.stars_rating),
    price: Number(row.price),
    // `numeric` llega como string o número según el cliente; nulo se queda nulo.
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    description: row.description,
    stock: row.stock,
    isFeatured: row.is_featured,
    fulfillment: row.fulfillment,
    leadTimeDays: row.lead_time_days,
    fitmentType: row.fitment_type,
    installable: row.installable,
    installationServiceId: row.installation_service_id,
    specs: toSpecs(row.specs),
    soldCount: row.sold_count,
    isTest: row.is_test,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/** @deprecated Usa `toProduct`. Se retira en la fase 7. */
export const toHubPart = toProduct;

/**
 * `specs` es jsonb y la ficha solo muestra pares de texto. Un valor que no sea
 * texto (alguien cargó `{"peso": 2}` a mano) se convierte en vez de perderse, y
 * lo que no sea un objeto se descarta entero.
 */
export function toSpecs(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === null || v === undefined) continue;
    out[key] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

export function toProductCategory(row: ProductCategoryRow): ProductCategoryModel {
  return {
    id: row.id,
    parentId: row.parent_id,
    slug: row.slug,
    name: row.name,
    icon: row.icon,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export function toVehicleMake(row: VehicleMakeRow): VehicleMakeModel {
  return { id: row.id, name: row.name, slug: row.slug };
}

export function toVehicleModel(row: VehicleModelRow): VehicleModelModel {
  return { id: row.id, makeId: row.make_id, name: row.name, slug: row.slug };
}

export function toProductFitment(row: ProductFitmentRow): ProductFitmentModel {
  return {
    id: row.id,
    productId: row.product_id,
    makeId: row.make_id,
    modelId: row.model_id,
    yearFrom: row.year_from,
    yearTo: row.year_to,
  };
}

export function toProfileVehicle(row: ProfileVehicleRow): ProfileVehicleModel {
  return {
    id: row.id,
    userId: row.user_id,
    makeId: row.make_id,
    modelId: row.model_id,
    year: row.year,
    nickname: row.nickname,
    isDefault: row.is_default,
  };
}

/** Ruta de detalle según la categoría. Antes venía guardada en el mock. */
function detailRouteFor(row: HubMarketItemRow): string {
  switch (row.category) {
    case 'vehiculos':
      return `/car-details/${row.id}`;
    case 'piezas':
      return `/hub-market-part-details/${row.id}`;
    case 'accesorios':
      return `/accessory-details/${row.id}`;
  }
}

export function toHubMarketItem(row: HubMarketItemRow): HubMarketItemModel {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    images: row.images ?? [],
    price: Number(row.price),
    location: row.location,
    // Si hay vendedor real, manda el nombre de su perfil; si no, el sembrado.
    sellerName: row.profiles?.display_name ?? row.seller_name,
    sellerId: row.seller_id ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    status: row.status,
    rejectionReason: row.rejection_reason ?? undefined,
    category: row.category,
    isTest: row.is_test,
    isFeatured: row.is_featured,
    detailRoute: detailRouteFor(row),
    createdAt: row.created_at,
    condition: row.condition ?? undefined,
    // spec_year es obligatorio para 'vehiculos' (constraint en el esquema),
    // así que su presencia es lo que decide si hay ficha técnica.
    vehicleSpecs:
      row.spec_year !== null
        ? {
            year: row.spec_year,
            mileage: row.spec_mileage ?? 0,
            hp: row.spec_hp ?? undefined,
            zeroTo100: row.spec_zero_to_100 ?? undefined,
            topSpeed: row.spec_top_speed ?? undefined,
            brand: row.spec_brand ?? undefined,
            model: row.spec_model ?? undefined,
          }
        : undefined,
  };
}

/** Modelo → fila, para publicar en Hub Market. */
export function fromHubMarketItem(
  item: Omit<HubMarketItemModel, 'id'>,
  sellerId: string,
  sellerName: string,
) {
  return {
    seller_id: sellerId,
    seller_name: sellerName,
    title: item.title,
    description: item.description,
    images: item.images,
    price: item.price,
    location: item.location,
    // Ya normalizado por quien llama (`publicar`): el check de la 0010 exige
    // solo dígitos, así que un formato con guiones sería un error del servidor.
    contact_phone: item.contactPhone ?? null,
    category: item.category,
    condition: item.condition ?? null,
    spec_year: item.vehicleSpecs?.year ?? null,
    spec_mileage: item.vehicleSpecs?.mileage ?? null,
    spec_hp: item.vehicleSpecs?.hp ?? null,
    spec_zero_to_100: item.vehicleSpecs?.zeroTo100 ?? null,
    spec_top_speed: item.vehicleSpecs?.topSpeed ?? null,
    spec_brand: item.vehicleSpecs?.brand ?? null,
    spec_model: item.vehicleSpecs?.model ?? null,
    // `status` **no** viaja en el insert a propósito: lo decide el trigger
    // `hub_market_force_status` (0012) según quién publique. Mandarlo desde el
    // cliente daría la falsa impresión de que el navegador elige el estado.
    //
    // `is_test` tampoco: una publicación nace normal y solo un moderador la
    // marca después, desde la cola de revisión (0013).
  };
}

export function toService(row: ServiceRow): ServiciosCardModel {
  return {
    id: row.id,
    icon: row.icon,
    title: row.title,
    description: row.description,
  };
}

export function toNews(row: NewsRow): NewCardModel {
  return {
    id: row.id,
    imageUrl: row.image_url,
    location: row.scope,
    // published_at llega como 'YYYY-MM-DD'. Se parsea a mediodía UTC para que
    // el cambio de zona horaria no mueva la fecha al día anterior en RD (-4).
    date: new Date(`${row.published_at}T12:00:00Z`),
    title: row.title,
    text: row.text,
    images: row.images ?? [],
    textLarge: row.text_large,
    author: row.author ?? undefined,
    isTest: row.is_test,
  };
}

export function toSocialPost(row: SocialPostRow): SocialPostModel {
  return {
    id: row.id,
    authorName: row.profiles?.display_name ?? row.author_name,
    authorClub: row.author_club ?? undefined,
    isVerified: row.profiles?.is_verified ?? false,
    createdAt: row.created_at,
    text: row.text,
    imageUrl: row.image_url ?? undefined,
    tags: row.tags ?? [],
    likes: row.likes,
    comments: row.comments,
  };
}

export function toSocialClub(row: SocialClubRow): SocialClubModel {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    members: row.members,
    focus: row.focus,
    description: row.description,
    imageUrl: row.image_url ?? undefined,
    isOfficial: row.is_official,
  };
}

export function toSocialEvent(row: SocialEventRow): SocialEventModel {
  return {
    id: row.id,
    title: row.title,
    date: row.event_date,
    location: row.location,
    organizer: row.organizer,
    description: row.description,
    imageUrl: row.image_url ?? undefined,
    attendees: row.attendees,
    price: Number(row.price),
  };
}

export function toShippingOption(row: ShippingOptionRow): CheckoutShippingOption {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    price: Number(row.price),
    etaLabel: row.eta_label,
  };
}

export function toPaymentMethod(row: PaymentMethodRow): CheckoutPaymentMethodOption {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
  };
}
