import { Injectable, signal } from '@angular/core';

/**
 * A qué formulario van las fotos: las tres primeras son del inventario oficial (`/admin/inventario`)
 * y `hubmarket` es una publicación de la comunidad (`/publicar`). Hub Market es siempre una opción
 * elegida, nunca el destino por defecto.
 */
export type BrandedDestination = 'piezas' | 'vehiculos' | 'noticias' | 'hubmarket';

export interface BrandedHandoff {
  destination: BrandedDestination;
  files: File[];
}

/**
 * Pasa las fotos que salieron de `/admin/marca` (ya con la insignia) al formulario de alta de
 * `/admin/inventario`, sin descargarlas y volver a subirlas a mano.
 *
 * Vive en memoria: si se recarga la página se pierden, que es lo esperado.
 */
@Injectable({ providedIn: 'root' })
export class BrandedPhotosService {
  private readonly pending = signal<BrandedHandoff | null>(null);

  offer(handoff: BrandedHandoff): void {
    this.pending.set(handoff);
  }

  /**
   * Entrega lo pendiente una sola vez, y solo si su destino es de los que pide quien llama:
   * el inventario no se lleva lo de Hub Market ni al revés.
   */
  take(...accept: BrandedDestination[]): BrandedHandoff | null {
    const handoff = this.pending();
    if (!handoff || !accept.includes(handoff.destination)) return null;
    this.pending.set(null);
    return handoff;
  }
}
