import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';

/**
 * Botón flotante "Volver arriba": aparece al bajar más de una pantalla en páginas largas
 * (la tienda, un perfil, el panel). El oyente de scroll es pasivo y solo toca la señal cuando
 * cambia de lado, así que desplazarse no provoca renders.
 */
@Component({
  selector: 'app-scroll-top',
  template: `
    @if (visible()) {
      <button type="button" class="scroll-top" aria-label="Volver arriba" (click)="top()">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      </button>
    }
  `,
  styleUrl: './scroll-top.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScrollTop {
  readonly visible = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const onScroll = () => {
        const far = window.scrollY > Math.max(900, window.innerHeight * 1.2);
        if (far !== this.visible()) this.visible.set(far);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      destroyRef.onDestroy(() => window.removeEventListener('scroll', onScroll));
    });
  }

  top(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
