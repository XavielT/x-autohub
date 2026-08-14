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
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

export type ProfileRow = {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_admin: boolean;
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
  created_at: string;
}

export type HubPartRow = {
  id: number;
  category: string;
  name: string;
  brand: string;
  img_url: string;
  images: string[];
  stars_rating: number;
  price: number;
  description: string;
  stock: number;
  is_active: boolean;
  created_at: string;
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
  category: HubMarketCategoryDb;
  condition: ItemCondition | null;
  is_featured: boolean;
  is_active: boolean;
  spec_year: number | null;
  spec_mileage: number | null;
  spec_hp: number | null;
  spec_zero_to_100: number | null;
  spec_top_speed: number | null;
  spec_brand: string | null;
  spec_model: string | null;
  created_at: string;
  /** Presente solo cuando el select incluye `profiles(display_name)`. */
  profiles?: { display_name: string } | null;
}

export type ServiceRow = {
  id: number;
  icon: string;
  title: string;
  description: string;
  sort_order: number;
  is_active: boolean;
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
  /** Presente solo cuando el select incluye `order_items(...)`. */
  order_items?: OrderItemRow[] | null;
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

/** Fila que devuelve `admin_list_users()`, no un select sobre `profiles`. */
export type AdminUserRow = {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  is_admin: boolean;
  is_verified: boolean;
  created_at: string;
}

export type OrderItemRow = {
  id: number;
  order_id: string;
  part_id: number | null;
  name: string;
  unit_price: number;
  quantity: number;
}

/**
 * Lo que el cliente puede insertar: las columnas con default en la base quedan
 * opcionales, y `profiles` (que solo aparece en los joins) se excluye siempre.
 */
export type Insert<T, Required extends keyof T> = Pick<T, Required> &
  Partial<Omit<T, Required | 'profiles' | 'order_items'>>;

/**
 * Claves foráneas. supabase-js las usa para validar los joins embebidos
 * (`select('*, profiles(display_name)')`); sin ellas el tipo del select no
 * resuelve.
 */
type HubMarketRelationships = [
  {
    foreignKeyName: 'hub_market_items_seller_id_fkey';
    columns: ['seller_id'];
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
        Insert: Insert<HubPartRow, 'category' | 'name' | 'brand' | 'img_url' | 'price'>;
        Update: Partial<HubPartRow>;
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
        Row: { id: number; email: string; created_at: string };
        Insert: { email: string };
        Update: Partial<{ email: string }>;
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
      /**
       * Crea un pedido con sus líneas en una sola transacción (migración 0005).
       *
       * El cliente solo dice qué pieza y cuántas: el precio, el subtotal y el
       * envío los calcula Postgres contra el catálogo. Es también el único
       * camino por el que el navegador puede crear un pedido.
       */
      /** Usuarios con su correo. Solo responde a un admin. Ver migración 0007. */
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
        };
        Returns: { id: string; total: number }[];
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
    };
    CompositeTypes: Record<string, never>;
  };
}
