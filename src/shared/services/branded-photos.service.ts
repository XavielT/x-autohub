import { Injectable, signal } from '@angular/core';

/** A qué formulario de inventario van las fotos. */
export type BrandedDestination = 'piezas' | 'vehiculos' | 'noticias';

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

  /** Entrega lo pendiente una sola vez. */
  take(): BrandedHandoff | null {
    const handoff = this.pending();
    this.pending.set(null);
    return handoff;
  }
}
