/**
 * Tipos de la base de datos, espejo de supabase/migrations/0001_schema.sql.
 *
 * Están escritos a mano en vez de generados para no depender del CLI de
 * Supabase. Si cambias el esquema, actualiza este archivo en el mismo commit —
 * es lo único que evita que un `select` con una columna mal escrita llegue a
 * producción.
 *
 * Para regenerarlos automáticamente (opcional, requiere el CLI):
 *   npx supabase gen types typescript --project-id <ref> > src/core/supabase/database.types.ts
 */

export type ChasisType = 'sedan' | 'suv' | 'hatchback' | 'pickup';
export type TractionType = 'fwd' | 'rwd' | 'awd' | '4x4';
export type FuelType = 'gasoline' | 'diesel' | 'glp' | 'electric';
export type HubMarketCategoryDb = 'vehiculos' | 'piezas' | 'accesorios';
export type ItemCondition = 'new' | 'used';
export type NewsScope = 'internacional' | 'local';
/**
 * El ciclo de un pedido (migración 0018):
 * `awaiting_payment → paid → preparing → shipped | ready_for_pickup → delivered`,
 * y `cancelled` hasta que sale de la tienda. `pending` es el estado técnico de los
 * pedidos anteriores a 0018.
 */
export type OrderStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'ready_for_pickup'
  | 'delivered'
  | 'cancelled';

/** Cómo recibe el cliente el pedido. Migración 0018. */
export type OrderFulfillmentDb = 'shipping' | 'pickup';

/** A qué se refiere una reseña. Migración 0020. */
export type ReviewTargetDb = 'product' | 'service';

/**
 * Una reseña de un producto o de un servicio (migración 0020).
 *
 * `is_verified_purchase` **la calcula Postgres** al insertar (pedido `delivered` con
 * ese producto, o cita `done` con ese servicio): lo que mande el navegador se pisa.
 * No hay UPDATE.
 */
export type ReviewRow = {
  id: number;
  target_type: ReviewTargetDb;
  target_id: number;
  user_id: string;
  rating: number;
  comment: string;
  is_verified_purchase: boolean;
  created_at: string;
  /** Presente solo cuando el select incluye `profiles(display_name)`. */
  profiles?: { display_name: string } | null;
}

/** La categoría de un servicio del taller. Migración 0019. */
export type ServiceCategoryDb =
  | 'instalacion'
  | 'mantenimiento'
  | 'mecanica'
  | 'electrico'
  | 'aire_acondicionado'
  | 'diagnostico';

/**
 * El ciclo de una cita (migración 0019):
 * `requested → confirmed → in_progress → done`, y `cancelled` / `no_show`.
 */
export type AppointmentStatusDb =
  | 'requested'
  | 'confirmed'
  | 'in_progress'
  | 'done'
  | 'cancelled'
  | 'no_show';

/** Cómo se cumple un producto: de inventario propio o bajo pedido. Migración 0017. */
export type ProductFulfillmentDb = 'stock' | 'on_order';

/** Si un producto sirve para cualquier vehículo o solo para los declarados. Migración 0017. */
export type ProductFitmentTypeDb = 'universal' | 'specific';

/** admin > moderador > user. Migración 0011. */
export type UserRoleDb = 'admin' | 'moderador' | 'user';

/** pendiente | aprobado | rechazado. Migración 0012. */
export type PublicationStatusDb = 'pendiente' | 'aprobado' | 'rechazado';

/**
 * El valor de una fila de `site_settings` (migración 0014).
 *
 * La columna es `jsonb`, así que puede ser cualquier cosa que quepa en JSON. Se
 * declara como unión y no como `unknown` para que el `select` de un ajuste no
 * obligue a un `as` en cada uso; quien lo lea sigue teniendo que estrechar el
 * tipo, que es correcto: Postgres no comprueba la forma del valor (lo hace un
 * `check` por clave).
 */
export type SettingValue = string | number | boolean | null | SettingValue[] | { [key: string]: SettingValue };

export type ProfileRow = {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  role: UserRoleDb;
  /**
   * Espejo de `role = 'admin'`, mantenido por trigger (migración 0011).
   *
   * Se conserva porque de él dependen el grant de columna de 0006 y los clientes
   * ya desplegados. **No se escribe**: la fuente de verdad es `role`, y quien lo
   * cambia es `set_user_role()`.
   */
  is_admin: boolean;
  /**
   * Puede ver las filas `is_test`. Migración 0013.
   *
   * **No es un rol**: un usuario de prueba sigue siendo `user`. Solo lo cambia
   * `set_user_test()`, y el trigger de 0005 —extendido en 0013— congela la
   * columna para cualquier sesión del navegador.
   */
  is_test_user: boolean;
  created_at: string;
}

export type AutoHubVehicleRow = {
  id: number;
  brand: string;
  model: string;
  year: number;
  price: number;
  color: string;
  mileage: number;
  chasis_type: ChasisType;
  doors: number;
  traction: TractionType;
  fuel: FuelType;
  cylinders: number;
  images: string[];
  description: string;
  location: string;
  contact: string;
  is_available: boolean;
  /** Contenido de prueba: solo lo ven admin, moderador y usuarios de prueba. Migración 0013. */
  is_test: boolean;
  created_at: string;
}

export type HubPartRow = {
  id: number;
  /**
   * Categoría de texto de la tienda anterior al pivote. Nula en los productos
   * nuevos que solo traen `category_id` (un trigger la rellena con la categoría
   * raíz). Sigue en pie: la tienda y el panel todavía la leen (ver `docs/ROADMAP.md`).
   */
  category: string | null;
  name: string;
  brand: string;
  img_url: string;
  images: string[];
  stars_rating: number;
  price: number;
  description: string;
  stock: number;
  is_active: boolean;
  /** Contenido de prueba: solo lo ven admin, moderador y usuarios de prueba. Migración 0013. */
  is_test: boolean;
  created_at: string;
  // --- Migración 0017 (tienda) ---
  category_id: number | null;
  /** Único. Lo rellena un trigger si viene vacío: `nombre-<id>`. */
  slug: string;
  /** Único. Lo rellena un trigger si viene vacío: `XAH-000123`. */
  sku: string;
  short_description: string;
  /** Precio anterior. Nulo = sin oferta; si existe, es mayor que `price`. */
  compare_at_price: number | null;
  is_featured: boolean;
  fulfillment: ProductFulfillmentDb;
  /** Obligatorio cuando `fulfillment = 'on_order'`. */
  lead_time_days: number | null;
  fitment_type: ProductFitmentTypeDb;
  installable: boolean;
  installation_service_id: number | null;
  specs: Record<string, SettingValue>;
  sold_count: number;
  updated_at: string;
  // --- Migración 0020 (reseñas) ---
  /**
   * Las estrellas de antes de las reseñas (dato sembrado). `stars_rating` vuelve a
   * este valor si el producto se queda sin reseñas.
   */
  stars_seed: number;
  /**
   * Cuántas reseñas reales tiene; lo mantiene un trigger. Mayor que 0 = `stars_rating`
   * es un promedio real y no el sembrado.
   */
  review_count: number;
  /**
   * Columna generada para la búsqueda de texto. Solo la lee la base: no viene
   * en los `select` que piden columnas y no se escribe nunca.
   */
  search_vector?: string;
}

/** Dos niveles como máximo: `parent_id` nulo es primer nivel. Migración 0017. */
export type ProductCategoryRow = {
  id: number;
  parent_id: number | null;
  slug: string;
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export type VehicleMakeRow = {
  id: number;
  name: string;
  slug: string;
}

export type VehicleModelRow = {
  id: number;
  make_id: number;
  name: string;
  slug: string;
}

/**
 * Un producto `specific` sirve para esta marca [y modelo] [entre estos años].
 * `model_id` nulo = toda la marca; los años nulos = sin límite.
 */
export type ProductFitmentRow = {
  id: number;
  product_id: number;
  make_id: number;
  model_id: number | null;
  year_from: number | null;
  year_to: number | null;
}

/** El garaje de un usuario. Cada quien ve solo el suyo. Migración 0017. */
export type ProfileVehicleRow = {
  id: number;
  user_id: string;
  make_id: number;
  model_id: number;
  year: number;
  nickname: string | null;
  is_default: boolean;
  created_at: string;
}

/**
 * Fila de `search_products()`: un producto más el total de la consulta. Es la
 * misma forma que `HubPartRow`, sin `search_vector`, y con `total_count` (el
 * número de coincidencias antes de paginar, igual en todas las filas).
 */
export type SearchProductRow = Omit<HubPartRow, 'search_vector'> & {
  total_count: number;
}

export type HubMarketItemRow = {
  id: number;
  seller_id: string | null;
  seller_name: string;
  title: string;
  description: string;
  images: string[];
  price: number;
  location: string;
  /** Solo dígitos, sin código de país. Migración 0010. */
  contact_phone: string | null;
  category: HubMarketCategoryDb;
  condition: ItemCondition | null;
  /**
   * Moderación (migración 0012). Un trigger lo fuerza a 'pendiente' al insertar
   * —salvo que quien publique modere— y lo congela en los updates normales: solo
   * `moderate_publication()` lo mueve.
   */
  status: PublicationStatusDb;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  is_featured: boolean;
  is_active: boolean;
  /**
   * Contenido de prueba (migración 0013). Lo escribe moderador o admin con un
   * update normal; para el dueño de la publicación el trigger lo congela.
   */
  is_test: boolean;
  spec_year: number | null;
  spec_mileage: number | null;
  spec_hp: number | null;
  spec_zero_to_100: number | null;
  spec_top_speed: number | null;
  spec_brand: string | null;
  spec_model: string | null;
  created_at: string;
  /**
   * Presente solo cuando el select pide el perfil del vendedor.
   *
   * El embed **tiene** que nombrar la clave foránea
   * (`profiles!hub_market_items_seller_id_fkey(display_name)`): desde 0012 hay dos
   * caminos a `profiles` y PostgREST rechaza el ambiguo con `PGRST201`.
   */
  profiles?: { display_name: string } | null;
}

export type ServiceRow = {
  id: number;
  icon: string;
  title: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  /** Migración 0019. */
  slug: string;
  category: ServiceCategoryDb;
  /** Nulo = a cotizar. */
  price_from: number | null;
  duration_minutes: number;
  is_bookable: boolean;
  images: string[];
  long_description: string;
}

/** Cuándo abre el taller. `weekday` 0 = domingo … 6 = sábado. Migración 0019. */
export type ServiceAvailabilityRow = {
  id: number;
  weekday: number;
  /** `HH:MM:SS`, hora de Santo Domingo. */
  opens_at: string;
  closes_at: string;
  slot_minutes: number;
  capacity: number;
  is_example: boolean;
}

export type ServiceBlackoutRow = {
  id: number;
  starts_at: string;
  ends_at: string;
  reason: string;
}

/** Una cita. Solo se lee: entra por `book_appointment()`. Migración 0019. */
export type ServiceAppointmentRow = {
  id: string;
  appointment_number: number;
  user_id: string | null;
  service_id: number;
  order_id: string | null;
  profile_vehicle_id: number | null;
  vehicle_text: string | null;
  contact_name: string;
  contact_phone: string;
  scheduled_at: string;
  status: AppointmentStatusDb;
  notes: string | null;
  status_note: string | null;
  created_at: string;
  updated_at: string;
  /** Presente solo cuando el select incluye `services(...)`. */
  services?: { title: string; slug: string } | null;
}

export type ServiceWorkRow = {
  id: number;
  service_id: number | null;
  title: string;
  description: string;
  before_image: string | null;
  after_image: string | null;
  vehicle_text: string | null;
  done_at: string;
  is_published: boolean;
  created_at: string;
}

/** Una fila de `my_appointments()` (migración 0019). */
export type MyAppointmentRow = {
  id: string;
  appointment_number: number;
  service_id: number;
  service_title: string;
  service_slug: string;
  scheduled_at: string;
  status: AppointmentStatusDb;
  vehicle_text: string | null;
  status_note: string | null;
  order_id: string | null;
}

export type NewsRow = {
  id: number;
  title: string;
  text: string;
  text_large: string;
  image_url: string;
  images: string[];
  scope: NewsScope;
  author: string | null;
  published_at: string;
  is_published: boolean;
  /** Contenido de prueba: solo lo ven admin, moderador y usuarios de prueba. Migración 0013. */
  is_test: boolean;
}

export type SocialClubRow = {
  id: number;
  name: string;
  location: string;
  focus: string;
  description: string;
  image_url: string | null;
  members: number;
  is_official: boolean;
  created_at: string;
}

export type SocialPostRow = {
  id: number;
  author_id: string | null;
  author_name: string;
  author_club: string | null;
  text: string;
  image_url: string | null;
  tags: string[];
  likes: number;
  comments: number;
  created_at: string;
  /** Presente solo cuando el select incluye `profiles(display_name, is_verified)`. */
  profiles?: { display_name: string; is_verified: boolean } | null;
}

export type SocialEventRow = {
  id: number;
  title: string;
  event_date: string;
  location: string;
  organizer: string;
  description: string;
  image_url: string | null;
  attendees: number;
  price: number;
  created_at: string;
}

export type ShippingOptionRow = {
  id: string;
  label: string;
  description: string;
  price: number;
  eta_label: string;
  sort_order: number;
  is_active: boolean;
}

export type PaymentMethodRow = {
  id: string;
  label: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

export type OrderRow = {
  id: string;
  user_id: string | null;
  contact_email: string;
  contact_phone: string | null;
  full_name: string;
  address_line1: string;
  city: string | null;
  postal_code: string | null;
  shipping_option_id: string;
  payment_method_id: string;
  order_notes: string | null;
  subtotal: number;
  shipping_price: number;
  total: number;
  status: OrderStatus;
  created_at: string;
  /** El número que se le dice al cliente (#1042). Migración 0018. */
  order_number: number;
  fulfillment_type: OrderFulfillmentDb;
  /** Nulo en un retiro en el taller. */
  province: string | null;
  /**
   * RUTA del comprobante en el bucket privado `payment-proofs`, no una URL: el
   * bucket es privado, así que para verlo hace falta una URL firmada.
   */
  payment_proof_url: string | null;
  payment_confirmed_at: string | null;
  whatsapp_opened_at: string | null;
  wants_installation: boolean;
  updated_at: string;
  /** Presente solo cuando el select incluye `order_items(...)`. */
  order_items?: OrderItemRow[] | null;
  /** Presente solo cuando el select incluye `order_status_history(...)`. */
  order_status_history?: OrderStatusHistoryRow[] | null;
}

/** Un cambio de estado de un pedido. La llena un trigger; el navegador solo la lee. */
export type OrderStatusHistoryRow = {
  id: number;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

/**
 * Lo que devuelve `get_order()` (migración 0018): el pedido para /pedido/:id, sin
 * nada personal (ni correo, ni teléfono, ni dirección). Es JSON, no una fila.
 */
export type OrderViewJson = {
  id: string;
  order_number: number;
  status: OrderStatus;
  fulfillment_type: OrderFulfillmentDb;
  payment_method_id: string;
  wants_installation: boolean;
  subtotal: number;
  shipping_price: number;
  total: number;
  created_at: string;
  has_proof: boolean;
  whatsapp_opened_at: string | null;
  payment_confirmed_at: string | null;
  installation_service_id: number | null;
  items: { name: string; unit_price: number; quantity: number }[];
  history: {
    from_status: OrderStatus | null;
    to_status: OrderStatus;
    note: string | null;
    created_at: string;
  }[];
}

/** Una fila de `my_orders()` (migración 0018). */
export type MyOrderRow = {
  id: string;
  order_number: number;
  status: OrderStatus;
  fulfillment_type: OrderFulfillmentDb;
  payment_method_id: string;
  total: number;
  created_at: string;
  item_count: number;
  has_proof: boolean;
  wants_installation: boolean;
}

export type ReleaseRow = {
  id: number;
  version: string;
  released_at: string;
  title: string;
  summary: string;
  changes: string[];
  is_published: boolean;
  created_at: string;
}

/**
 * Fila que devuelve `get_my_profile()`, no un select sobre `profiles`.
 *
 * Es la única forma de que un usuario lea su propio `phone`: la migración 0006
 * quitó esa columna a las claves anon y authenticated, y los permisos de columna
 * son por rol y no por fila. Ver la migración 0009.
 */
export type MyProfileRow = {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  avatar_url: string | null;
  role: UserRoleDb;
  is_verified: boolean;
  is_admin: boolean;
  is_test_user: boolean;
  created_at: string;
}

/** Fila que devuelve `admin_list_users()`, no un select sobre `profiles`. */
export type AdminUserRow = {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  role: UserRoleDb;
  is_admin: boolean;
  is_verified: boolean;
  is_test_user: boolean;
  created_at: string;
}

export type OrderItemRow = {
  id: number;
  order_id: string;
  part_id: number | null;
  name: string;
  unit_price: number;
  quantity: number;
  /** Cuánto stock descontó esta línea (0 si era bajo pedido). Migración 0018. */
  stock_deducted: number;
}

/**
 * Lo que el cliente puede insertar: las columnas con default en la base quedan
 * opcionales, y `profiles` (que solo aparece en los joins) se excluye siempre.
 */
export type Insert<T, Required extends keyof T> = Pick<T, Required> &
  Partial<Omit<T, Required | 'profiles' | 'order_items' | 'order_status_history'>>;

/**
 * Claves foráneas. supabase-js las usa para validar los joins embebidos
 * (`select('*, profiles!hub_market_items_seller_id_fkey(display_name)')`); sin
 * ellas el tipo del select no resuelve.
 */
type HubMarketRelationships = [
  {
    foreignKeyName: 'hub_market_items_seller_id_fkey';
    columns: ['seller_id'];
    isOneToOne: false;
    referencedRelation: 'profiles';
    referencedColumns: ['id'];
  },
  // El segundo camino a `profiles`, de la migración 0012. Se declara aunque nadie
  // lo consulte: es lo que hace ambiguo el embed `profiles(...)`, y tenerlo aquí
  // es lo que permite que el tipado exija nombrar la clave.
  {
    foreignKeyName: 'hub_market_items_reviewed_by_fkey';
    columns: ['reviewed_by'];
    isOneToOne: false;
    referencedRelation: 'profiles';
    referencedColumns: ['id'];
  },
];
type OrderItemRelationships = [
  {
    foreignKeyName: 'order_items_order_id_fkey';
    columns: ['order_id'];
    isOneToOne: false;
    referencedRelation: 'orders';
    referencedColumns: ['id'];
  },
];
type ServiceAppointmentRelationships = [
  {
    foreignKeyName: 'service_appointments_service_id_fkey';
    columns: ['service_id'];
    isOneToOne: false;
    referencedRelation: 'services';
    referencedColumns: ['id'];
  },
];
type OrderStatusHistoryRelationships = [
  {
    foreignKeyName: 'order_status_history_order_id_fkey';
    columns: ['order_id'];
    isOneToOne: false;
    referencedRelation: 'orders';
    referencedColumns: ['id'];
  },
];
type ReviewRelationships = [
  {
    foreignKeyName: 'reviews_user_id_fkey';
    columns: ['user_id'];
    isOneToOne: false;
    referencedRelation: 'profiles';
    referencedColumns: ['id'];
  },
];

type SocialPostRelationships = [
  {
    foreignKeyName: 'social_posts_author_id_fkey';
    columns: ['author_id'];
    isOneToOne: false;
    referencedRelation: 'profiles';
    referencedColumns: ['id'];
  },
];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Insert<ProfileRow, 'id' | 'display_name' | 'email'>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      auto_hub_vehicles: {
        Row: AutoHubVehicleRow;
        Insert: Insert<
          AutoHubVehicleRow,
          | 'brand' | 'model' | 'year' | 'price' | 'color' | 'mileage'
          | 'chasis_type' | 'doors' | 'traction' | 'fuel' | 'cylinders' | 'location' | 'contact'
        >;
        Update: Partial<AutoHubVehicleRow>;
        Relationships: [];
      };
      hub_parts: {
        Row: HubPartRow;
        Insert: Insert<HubPartRow, 'name' | 'brand' | 'img_url' | 'price'>;
        Update: Partial<HubPartRow>;
        Relationships: [];
      };
      product_categories: {
        Row: ProductCategoryRow;
        Insert: Insert<ProductCategoryRow, 'slug' | 'name'>;
        Update: Partial<ProductCategoryRow>;
        Relationships: [];
      };
      vehicle_makes: {
        Row: VehicleMakeRow;
        Insert: Insert<VehicleMakeRow, 'name' | 'slug'>;
        Update: Partial<VehicleMakeRow>;
        Relationships: [];
      };
      vehicle_models: {
        Row: VehicleModelRow;
        Insert: Insert<VehicleModelRow, 'make_id' | 'name' | 'slug'>;
        Update: Partial<VehicleModelRow>;
        Relationships: [];
      };
      product_fitments: {
        Row: ProductFitmentRow;
        Insert: Insert<ProductFitmentRow, 'product_id' | 'make_id'>;
        Update: Partial<ProductFitmentRow>;
        Relationships: [];
      };
      profile_vehicles: {
        Row: ProfileVehicleRow;
        Insert: Insert<ProfileVehicleRow, 'user_id' | 'make_id' | 'model_id' | 'year'>;
        Update: Partial<ProfileVehicleRow>;
        Relationships: [];
      };
      hub_market_items: {
        Row: HubMarketItemRow;
        Insert: Insert<
          HubMarketItemRow,
          'seller_name' | 'title' | 'price' | 'location' | 'category'
        >;
        Update: Partial<Omit<HubMarketItemRow, 'profiles'>>;
        Relationships: HubMarketRelationships;
      };
      services: {
        Row: ServiceRow;
        Insert: Insert<ServiceRow, 'icon' | 'title' | 'description'>;
        Update: Partial<ServiceRow>;
        Relationships: [];
      };
      service_availability: {
        Row: ServiceAvailabilityRow;
        Insert: Insert<ServiceAvailabilityRow, 'weekday' | 'opens_at' | 'closes_at'>;
        Update: Partial<ServiceAvailabilityRow>;
        Relationships: [];
      };
      service_blackouts: {
        Row: ServiceBlackoutRow;
        Insert: Insert<ServiceBlackoutRow, 'starts_at' | 'ends_at'>;
        Update: Partial<ServiceBlackoutRow>;
        Relationships: [];
      };
      /**
       * Citas (migración 0019). **Sin Insert ni Update desde el navegador**: no
       * tienen política de escritura; entran por `book_appointment()` y cambian
       * por `set_appointment_status()` y `cancel_appointment()`.
       */
      service_appointments: {
        Row: ServiceAppointmentRow;
        Insert: never;
        Update: never;
        Relationships: ServiceAppointmentRelationships;
      };
      /**
       * Reseñas (migración 0020). Lee cualquiera; escribe el autor (con la
       * compra verificada calculada por un trigger); borran el autor o el admin.
       * **Sin Update**: ni política ni permiso.
       */
      reviews: {
        Row: ReviewRow;
        Insert: Insert<ReviewRow, 'target_type' | 'target_id' | 'user_id' | 'rating'>;
        Update: never;
        Relationships: ReviewRelationships;
      };
      service_works: {
        Row: ServiceWorkRow;
        Insert: Insert<ServiceWorkRow, 'title'>;
        Update: Partial<ServiceWorkRow>;
        Relationships: [];
      };
      news: {
        Row: NewsRow;
        Insert: Insert<NewsRow, 'title' | 'text' | 'image_url' | 'scope'>;
        Update: Partial<NewsRow>;
        Relationships: [];
      };
      social_clubs: {
        Row: SocialClubRow;
        Insert: Insert<SocialClubRow, 'name' | 'location' | 'focus'>;
        Update: Partial<SocialClubRow>;
        Relationships: [];
      };
      social_posts: {
        Row: SocialPostRow;
        Insert: Insert<SocialPostRow, 'author_name' | 'text'>;
        Update: Partial<Omit<SocialPostRow, 'profiles'>>;
        Relationships: SocialPostRelationships;
      };
      social_events: {
        Row: SocialEventRow;
        Insert: Insert<SocialEventRow, 'title' | 'event_date' | 'location' | 'organizer'>;
        Update: Partial<SocialEventRow>;
        Relationships: [];
      };
      club_subscriptions: {
        /**
         * `unsubscribe_token` (migración 0016) va en el enlace de baja del
         * correo. Está en el tipo porque la Edge Function lo lee con la clave
         * `service_role`; **desde el navegador no se puede leer** — la tabla no
         * tiene política de select para `anon`.
         */
        Row: { id: number; email: string; created_at: string; unsubscribe_token: string };
        Insert: { email: string };
        Update: Partial<{ email: string }>;
        Relationships: [];
      };
      /**
       * Ajustes del sitio, clave/valor (migración 0014).
       *
       * Se lee en público (`anon` incluido: el home los necesita sin sesión) y
       * **no se escribe por aquí**: la tabla no tiene política de escritura, así
       * que `Insert` y `Update` no existen desde el navegador. El único camino
       * es la función `set_site_setting()`.
       */
      site_settings: {
        Row: { key: string; value: SettingValue; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      shipping_options: {
        Row: ShippingOptionRow;
        Insert: ShippingOptionRow;
        Update: Partial<ShippingOptionRow>;
        Relationships: [];
      };
      payment_methods: {
        Row: PaymentMethodRow;
        Insert: PaymentMethodRow;
        Update: Partial<PaymentMethodRow>;
        Relationships: [];
      };
      releases: {
        Row: ReleaseRow;
        Insert: Insert<ReleaseRow, 'version' | 'title'>;
        Update: Partial<ReleaseRow>;
        Relationships: [];
      };
      orders: {
        Row: OrderRow;
        Insert: Insert<
          OrderRow,
          | 'contact_email' | 'full_name' | 'address_line1'
          | 'shipping_option_id' | 'payment_method_id' | 'subtotal' | 'total'
        >;
        Update: Partial<OrderRow>;
        Relationships: [];
      };
      /**
       * Historial de estados de cada pedido (migración 0018). Solo lectura: sin
       * política de escritura, lo llena un trigger.
       */
      order_status_history: {
        Row: OrderStatusHistoryRow;
        Insert: never;
        Update: never;
        Relationships: OrderStatusHistoryRelationships;
      };
      order_items: {
        Row: OrderItemRow;
        Insert: Insert<OrderItemRow, 'order_id' | 'name' | 'unit_price' | 'quantity'>;
        Update: Partial<OrderItemRow>;
        Relationships: OrderItemRelationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      /** true para moderador y para admin (migración 0011). */
      is_moderator_or_admin: { Args: Record<string, never>; Returns: boolean };
      /**
       * true para admin, moderador y usuarios de prueba (migración 0013).
       *
       * El cliente no la llama: existe para las políticas de select y para
       * `create_order()`. Se declara para que el tipo del esquema no mienta.
       */
      can_see_test_items: { Args: Record<string, never>; Returns: boolean };
      /**
       * Crea un pedido con sus líneas en una sola transacción (migración 0005).
       *
       * El cliente solo dice qué pieza y cuántas: el precio, el subtotal y el
       * envío los calcula Postgres contra el catálogo. Es también el único
       * camino por el que el navegador puede crear un pedido.
       */
      /** Usuarios con su correo. Solo responde a un admin. Ver migración 0007. */
      /**
       * El perfil de quien llama, con su `email` y su `phone`. No recibe ningún
       * id: usa `auth.uid()`, así que no puede devolver el de otra persona.
       */
      get_my_profile: {
        Args: Record<string, never>;
        Returns: MyProfileRow[];
      };
      admin_list_users: {
        Args: Record<string, never>;
        Returns: AdminUserRow[];
      };
      /**
       * Da o quita admin y verificado a otro usuario.
       *
       * Hace falta una función porque la política de `profiles` solo deja editar
       * tu propia fila y el trigger de 0005 congela esas dos columnas. Comprueba
       * que quien llama ya sea admin.
       */
      set_user_admin: {
        Args: { p_user_id: string; p_is_admin: boolean; p_is_verified?: boolean | null };
        Returns: { id: string; display_name: string; is_admin: boolean; is_verified: boolean }[];
      };
      /**
       * Reparte roles. **Solo un admin**: un moderador no nombra a nadie, ni
       * siquiera otro moderador. Ver migración 0011.
       */
      set_user_role: {
        Args: { p_user_id: string; p_role: UserRoleDb; p_is_verified?: boolean | null };
        Returns: {
          id: string;
          display_name: string;
          role: UserRoleDb;
          is_admin: boolean;
          is_verified: boolean;
        }[];
      };
      /**
       * Marca (o desmarca) una cuenta como usuario de prueba. **Solo un admin**:
       * dar acceso al contenido oculto es repartir acceso. Ver migración 0013.
       *
       * Es una función aparte y no un parámetro de `set_user_role()` porque ser
       * usuario de prueba no es un rol: quien lo tiene sigue siendo `user`.
       */
      set_user_test: {
        Args: { p_user_id: string; p_is_test: boolean };
        Returns: { id: string; display_name: string; is_test_user: boolean }[];
      };
      /**
       * Aprueba o rechaza una publicación en una sola transacción (estado,
       * motivo, quién revisó y cuándo). Es el único camino sancionado: el
       * trigger de 0012 congela esas columnas en cualquier otro update.
       */
      moderate_publication: {
        Args: { p_id: number; p_decision: 'aprobado' | 'rechazado'; p_reason?: string | null };
        Returns: {
          id: number;
          status: PublicationStatusDb;
          rejection_reason: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
        }[];
      };
      /**
       * Los tres contadores del home en una sola llamada (migración 0014).
       *
       * `security definer` por **miembros**: contar `profiles` con la clave anon
       * es imposible a propósito. Devuelve solo números, nunca filas, y aplica
       * la visibilidad de un visitante anónimo sea quien sea el que llame — así
       * un admin no ve en el home unos números que nadie más ve.
       */
      /**
       * Saca de la lista del club a quien tenga ese token (migración 0016).
       *
       * Se le da a `anon` a propósito, al contrario de las funciones de admin:
       * el enlace se abre desde el correo, casi siempre sin sesión. Devuelve
       * `false` —y no lanza— cuando el token no existe, que es lo que pasa al
       * abrir dos veces el mismo enlace.
       */
      unsubscribe_from_club: {
        Args: { p_token: string };
        Returns: boolean;
      };
      /**
       * Búsqueda de la tienda (migración 0017): texto, categoría, vehículo,
       * precio y stock en una sola consulta, ya ordenada y paginada.
       *
       * `security invoker`: RLS decide qué productos ve quien llama, así que
       * `anon` la puede invocar. Los parámetros llevan prefijo `p_`.
       *
       * Con vehículo devuelve los `universal` y los `specific` con un fitment
       * que lo cubra; un `specific` sin fitments no aparece.
       */
      search_products: {
        Args: {
          p_query?: string | null;
          p_category_slug?: string | null;
          p_make_id?: number | null;
          p_model_id?: number | null;
          p_year?: number | null;
          p_min_price?: number | null;
          p_max_price?: number | null;
          p_in_stock_only?: boolean;
          p_sort?: 'relevance' | 'price_asc' | 'price_desc' | 'best_sellers' | 'newest';
          p_limit?: number;
          p_offset?: number;
        };
        Returns: SearchProductRow[];
      };
      get_site_stats: {
        Args: Record<string, never>;
        Returns: { vehicles: number; parts: number; members: number }[];
      };
      /**
       * Cambia un ajuste **existente**. Solo un admin, comprobado dentro de
       * Postgres. No crea claves nuevas: un ajuste nace en una migración.
       */
      set_site_setting: {
        Args: { p_key: string; p_value: SettingValue };
        Returns: { key: string; value: SettingValue; updated_at: string }[];
      };
      /**
       * Crea un pedido (migración 0018): precios y envío de la base, stock
       * validado y descontado si es de inventario propio, estado
       * `awaiting_payment`. Devuelve los totales **que calculó Postgres**: es lo que
       * el cliente muestra.
       */
      create_order: {
        Args: {
          p_contact_email: string;
          p_full_name: string;
          p_address_line1: string;
          p_shipping_option_id: string;
          p_payment_method_id: string;
          p_items: { part_id: number; quantity: number }[];
          p_contact_phone?: string | null;
          p_city?: string | null;
          p_postal_code?: string | null;
          p_order_notes?: string | null;
          p_fulfillment_type?: OrderFulfillmentDb;
          p_province?: string | null;
          p_wants_installation?: boolean;
        };
        Returns: {
          id: string;
          order_number: number;
          subtotal: number;
          shipping_price: number;
          total: number;
        }[];
      };
      /**
       * Promedio (1 decimal) y cuántas reseñas hay de cada estrella (`c1`…`c5`) de un
       * producto o un servicio. La puede llamar un invitado (migración 0020).
       */
      review_stats: {
        Args: { p_target_type: ReviewTargetDb; p_target_id: number };
        Returns: { total: number; average: number; c1: number; c2: number; c3: number; c4: number; c5: number }[];
      };
      /**
       * Las horas libres de un día, en hora de Santo Domingo, con los cupos que
       * quedan. Nunca devuelve horas pasadas. `anon` la invoca (migración 0019).
       */
      available_slots: {
        Args: { p_service_id: number; p_date: string };
        Returns: { slot_at: string; remaining: number }[];
      };
      /**
       * Agenda una cita (nace `requested`). Revalida el slot y el tope de 3 citas
       * abiertas por teléfono dentro de Postgres. `anon` la invoca.
       */
      book_appointment: {
        Args: {
          p_service_id: number;
          p_scheduled_at: string;
          p_contact_name: string;
          p_contact_phone: string;
          p_vehicle_text?: string | null;
          p_profile_vehicle_id?: number | null;
          p_order_id?: string | null;
          p_notes?: string | null;
        };
        Returns: {
          id: string;
          appointment_number: number;
          service_id: number;
          scheduled_at: string;
          status: AppointmentStatusDb;
        }[];
      };
      /** Solo admin, en orden (migración 0019). */
      set_appointment_status: {
        Args: { p_id: string; p_to: AppointmentStatusDb; p_note?: string | null };
        Returns: { id: string; appointment_number: number; status: AppointmentStatusDb }[];
      };
      /** El dueño cancela la suya, con más de 24 horas de anticipación. */
      cancel_appointment: {
        Args: { p_id: string };
        Returns: undefined;
      };
      my_appointments: {
        Args: Record<string, never>;
        Returns: MyAppointmentRow[];
      };
      /**
       * Mueve un pedido al siguiente estado válido. Solo admin; el orden lógico
       * se comprueba dentro de Postgres (migración 0018).
       */
      set_order_status: {
        Args: { p_order_id: string; p_to: OrderStatus; p_note?: string | null };
        Returns: {
          id: string;
          order_number: number;
          status: OrderStatus;
          payment_confirmed_at: string | null;
        }[];
      };
      /** Apunta el pedido a un comprobante ya subido a su carpeta (migración 0018). */
      attach_payment_proof: {
        Args: { p_order_id: string; p_path: string };
        Returns: undefined;
      };
      /** Anota que el cliente abrió WhatsApp. Idempotente (migración 0018). */
      mark_whatsapp_opened: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
      /**
       * El pedido para /pedido/:id, por id. `null` si no existe. Sin datos
       * personales (migración 0018).
       */
      get_order: {
        Args: { p_order_id: string };
        Returns: OrderViewJson | null;
      };
      /** Los pedidos de quien llama, del más nuevo al más viejo (migración 0018). */
      my_orders: {
        Args: Record<string, never>;
        Returns: MyOrderRow[];
      };
    };
    Enums: {
      chasis_type: ChasisType;
      traction_type: TractionType;
      fuel_type: FuelType;
      hub_market_category: HubMarketCategoryDb;
      item_condition: ItemCondition;
      news_scope: NewsScope;
      order_status: OrderStatus;
      order_fulfillment: OrderFulfillmentDb;
      service_category: ServiceCategoryDb;
      appointment_status: AppointmentStatusDb;
      product_fulfillment: ProductFulfillmentDb;
      product_fitment_type: ProductFitmentTypeDb;
      review_target: ReviewTargetDb;
    };
    CompositeTypes: Record<string, never>;
  };
}
