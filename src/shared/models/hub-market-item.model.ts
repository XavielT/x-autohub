export type HubMarketCategory = 'vehiculos' | 'piezas' | 'accesorios';

export interface HubMarketItemModel {
  id: number;
  title: string;
  description: string;
  images: string[];
  price: number;
  location: string;
  sellerName: string;
  /** uuid del perfil que publicó. Ausente en el contenido sembrado. */
  sellerId?: string;
  /**
   * Teléfono de contacto **de la publicación**, para el botón de WhatsApp.
   *
   * Vive aquí y no en el perfil del vendedor a propósito: la migración 0006 le
   * quitó `profiles.phone` a las claves anon y authenticated, así que no hay
   * forma —ni debe haberla— de leer el teléfono de otro usuario. El vendedor lo
   * escribe al publicar y decide en cada publicación si lo comparte.
   *
   * Diez dígitos, sin código de país ni separadores (`8095550134`). Ver
   * `shared/utils/phone.ts`.
   */
  contactPhone?: string;
  category: HubMarketCategory;
  isFeatured?: boolean;
  detailRoute?: string;
  createdAt?: string;
  condition?: 'new' | 'used';
  vehicleSpecs?: {
    year: number;
    mileage: number;
    hp?: number;
    zeroTo100?: number;
    topSpeed?: number;
    brand?: string;
    model?: string;
  };
}
