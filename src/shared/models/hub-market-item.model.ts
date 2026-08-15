export type HubMarketCategory = 'vehiculos' | 'piezas' | 'accesorios';

/**
 * Estado de moderación de una publicación (migración 0012).
 *
 * - `pendiente` — recién publicada. Solo la ven su dueño y quien modera.
 * - `aprobado` — visible en el sitio. Es lo único que sale en Hub Market.
 * - `rechazado` — no se publica; su dueño ve el motivo en /perfil.
 */
export type PublicationStatus = 'pendiente' | 'aprobado' | 'rechazado';

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
  /**
   * Estado de moderación. El cliente **no** lo elige: lo pone un trigger al
   * insertar y solo `moderate_publication()` lo mueve después.
   *
   * Opcional en el modelo por el contenido sembrado y por los mocks viejos, que
   * se leen como `aprobado` — ver `HubMarketService`.
   */
  status?: PublicationStatus;
  /** Por qué se rechazó. Solo lo ve su dueño, en /perfil. */
  rejectionReason?: string;
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
