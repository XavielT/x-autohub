import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * Avisa cuando hay una versión nueva del sitio lista, y la activa a pedido.
 *
 * El service worker descarga la versión nueva en segundo plano (`VERSION_READY`),
 * pero la pestaña sigue con la vieja hasta recargar. No se recarga sola: se perdería
 * lo que alguien esté escribiendo en el carrito o en un formulario.
 *
 * `SwUpdate` es opcional a propósito: en desarrollo y en las pruebas no hay service
 * worker, y entonces este servicio no hace nada.
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly sw = inject(SwUpdate, { optional: true });
  private readonly doc = inject(DOCUMENT);

  /** Hay una versión descargada esperando a que el usuario la active. */
  readonly updateReady = signal(false);

  constructor() {
    const sw = this.sw;
    if (!sw?.isEnabled) return;

    sw.versionUpdates
      .pipe(
        filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.updateReady.set(true));

    // Una app instalada casi nunca se recarga: al volver a ella se busca a mano.
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'visible') void this.check();
    });
  }

  /** Pregunta al servidor si hay versión nueva. Un fallo de red no es un error. */
  async check(): Promise<boolean> {
    if (!this.sw?.isEnabled) return false;

    try {
      return await this.sw.checkForUpdate();
    } catch {
      return false;
    }
  }

  /** Activa la versión nueva y recarga. Recarga aunque la activación falle. */
  async apply(): Promise<void> {
    try {
      await this.sw?.activateUpdate();
    } catch {
      // Da igual por qué falló: recargar ya trae la versión nueva si el worker la tiene lista.
    }
    this.reload();
  }

  dismiss(): void {
    this.updateReady.set(false);
  }

  /** Aparte para poder sustituirlo en las pruebas: jsdom no implementa `reload()`. */
  protected reload(): void {
    this.doc.location.reload();
  }
}
