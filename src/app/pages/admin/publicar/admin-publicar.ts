import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SiteRebuildService } from '../../../../shared/services/site-rebuild.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { SiteRebuildStatus } from '../../../../shared/models/site-rebuild.model';

/**
 * La barra de "Publicar" del panel (solo admins).
 *
 * Las páginas públicas son una foto del último despliegue: un cambio de catálogo llega a los
 * buscadores y a la vista previa de WhatsApp cuando el sitio se vuelve a publicar. La base lo
 * pide sola unos minutos después del último cambio (migración 0026); esta barra dice si hay
 * algo pendiente y deja pedirlo ya, sin esperar (migración 0027).
 */
@Component({
  selector: 'app-admin-publicar',
  imports: [DatePipe],
  templateUrl: './admin-publicar.html',
  styleUrl: './admin-publicar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPublicar implements OnInit {
  private readonly rebuild = inject(SiteRebuildService);
  private readonly toast = inject(ToastService);

  readonly status = signal<SiteRebuildStatus | null>(null);
  readonly failed = signal(false);
  readonly isSending = signal(false);

  /** Hace cuántos minutos hay cambios sin publicar, redondeado hacia abajo (mínimo 1). */
  readonly pendingMinutes = computed(() => {
    const since = this.status()?.pendingSince;
    if (!since) return 0;
    return Math.max(1, Math.floor((Date.now() - Date.parse(since)) / 60_000));
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.rebuild.getStatus().subscribe({
      next: (status) => {
        this.status.set(status);
        this.failed.set(false);
      },
      // La barra es informativa: si no se lee, se dice y el resto del panel sigue igual.
      error: () => this.failed.set(true),
    });
  }

  publishNow(): void {
    if (this.isSending()) return;
    this.isSending.set(true);

    this.rebuild.requestNow().subscribe({
      next: (result) => {
        this.isSending.set(false);
        if (result === 'requested') {
          this.toast.show('Publicacion pedida. En unos minutos se ven los cambios en el sitio.');
        } else if (result === 'too_soon') {
          this.toast.show('Ya se pidio hace un momento. Espera un minuto y vuelve a intentar.', 'error');
        } else {
          this.toast.show('Falta cargar el enlace de publicacion en Supabase (vercel_deploy_hook).', 'error');
        }
        this.load();
      },
      error: (error: Error) => {
        this.isSending.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }
}
