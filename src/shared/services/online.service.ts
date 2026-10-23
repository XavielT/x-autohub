import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Si el navegador cree que hay red. `navigator.onLine` solo dice "hay una interfaz
 * conectada", no "internet funciona": por eso las pantallas lo usan para elegir el
 * mensaje de un error que ya ocurrió ("Sin conexión" en vez de uno genérico), no para
 * decidir si piden los datos.
 */
@Injectable({ providedIn: 'root' })
export class OnlineService {
  private readonly win = inject(DOCUMENT).defaultView;

  private readonly state = signal(this.read());
  private readonly subject = new BehaviorSubject<boolean>(this.state());

  /** Para plantillas y `computed`. */
  readonly isOnline = this.state.asReadonly();

  /** Para quien prefiere un flujo. Emite el valor actual al suscribirse. */
  readonly online$: Observable<boolean> = this.subject.asObservable();

  constructor() {
    this.win?.addEventListener('online', () => this.set(true));
    this.win?.addEventListener('offline', () => this.set(false));
  }

  private read(): boolean {
    return this.win?.navigator.onLine ?? true;
  }

  private set(value: boolean): void {
    this.state.set(value);
    this.subject.next(value);
  }
}
