import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';

/** Cuánto se queda la barra llena antes de esconderse al terminar (ms). */
const HIDE_AFTER_MS = 250;

/**
 * Barra fina ámbar (2px) arriba de todo en cada navegación: arranca con `NavigationStart` y
 * termina con `NavigationEnd`, `NavigationCancel` o `NavigationError`. Sin librerías. Sin
 * animación de ancho con `prefers-reduced-motion` (aparece y desaparece).
 */
@Component({
  selector: 'app-route-progress',
  template: `<div class="rp" [class.rp--on]="state() !== 'idle'" [class.rp--done]="state() === 'done'" role="progressbar" aria-hidden="true"></div>`,
  styleUrl: './route-progress.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteProgress {
  readonly state = signal<'idle' | 'loading' | 'done'>('idle');

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    inject(Router)
      .events.pipe(takeUntilDestroyed(destroyRef))
      .subscribe((event) => {
        if (event instanceof NavigationStart) this.start();
        else if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) this.finish();
      });
    destroyRef.onDestroy(() => this.clear());
  }

  private start(): void {
    this.clear();
    this.state.set('loading');
  }

  private finish(): void {
    if (this.state() === 'idle') return;
    this.clear();
    this.state.set('done');
    this.timer = setTimeout(() => this.state.set('idle'), HIDE_AFTER_MS);
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
