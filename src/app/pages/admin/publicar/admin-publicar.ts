import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SiteRebuildService } from '../../../../shared/services/site-rebuild.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { SiteBuild, SiteRebuildStatus } from '../../../../shared/models/site-rebuild.model';

/** Cada cuánto se vuelve a preguntar por el despliegue mientras se construye. */
const POLL_MS = 10_000;
/** Cuánto se vigila un despliegue recién pedido antes de rendirse (un build tarda 1 o 2 minutos). */
const WATCH_AFTER_PUBLISH_MS = 6 * 60_000;
/** Y uno que ya venía en marcha cuando se abrió el panel. */
const WATCH_ON_OPEN_MS = 10 * 60_000;
/** Un despliegue se considera "el que acabo de pedir" si se creó hasta 10 s antes del clic (relojes). */
const CLOCK_SLACK_MS = 10_000;

/**
 * La barra de "Publicar" del panel (solo admins).
 *
 * Las páginas públicas son una foto del último despliegue: un cambio de catálogo llega a los
 * buscadores y a la vista previa de WhatsApp cuando el sitio se vuelve a publicar. La base lo
 * pide sola unos minutos después del último cambio (migración 0026); esta barra dice si hay
 * algo pendiente y deja pedirlo ya, sin esperar (migración 0027).
 *
 * Y dice **cómo terminó**: pregunta a la Edge Function `build-status` por el último despliegue
 * de Vercel (construyendo, listo, falló). Mientras uno se construye, vuelve a preguntar cada
 * 10 segundos. Si la función no está o no tiene su token, esa línea simplemente no aparece.
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
  readonly build = signal<SiteBuild | null>(null);
  readonly failed = signal(false);
  readonly isSending = signal(false);

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Hasta cuándo se sigue preguntando (epoch ms). 0 = no se vigila nada. */
  private watchUntil = 0;
  /** Cuándo se pidió el despliegue que se espera (epoch ms). 0 = se vigila el que ya estaba en marcha. */
  private watchSince = 0;

  /** Hace cuántos minutos hay cambios sin publicar, redondeado hacia abajo (mínimo 1). */
  readonly pendingMinutes = computed(() => {
    const since = this.status()?.pendingSince;
    if (!since) return 0;
    return Math.max(1, Math.floor((Date.now() - Date.parse(since)) / 60_000));
  });

  /** Un despliegue que todavía no terminó. */
  readonly isBuilding = computed(() => {
    const state = this.build()?.state;
    return state === 'queued' || state === 'building';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopWatching());
  }

  ngOnInit(): void {
    this.load();
    this.loadBuild(WATCH_ON_OPEN_MS);
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

  /**
   * Lee el despliegue y decide si hay que volver a preguntar: sí mientras se construye, o mientras
   * se espera uno que se acaba de pedir y todavía no aparece. `watchMs` abre la ventana de vigilancia
   * solo si el despliegue ya venía en marcha.
   */
  private loadBuild(watchMs = 0): void {
    this.rebuild.getBuild().subscribe((build) => {
      this.build.set(build);

      const now = Date.now();
      const inFlight = build?.state === 'queued' || build?.state === 'building';
      if (inFlight && this.watchUntil === 0) this.watchUntil = now + watchMs;

      const isTheAwaitedOne = !!build?.createdAt && Date.parse(build.createdAt) >= this.watchSince - CLOCK_SLACK_MS;
      // Sin saber nada del despliegue (la función no está o no tiene su token) no hay nada que vigilar.
      const waitingForNew = build !== null && this.watchSince > 0 && !isTheAwaitedOne;

      if ((inFlight || waitingForNew) && now < this.watchUntil) {
        this.schedule();
      } else {
        // Terminó (o nos rendimos): se deja de vigilar y se refresca el estado de "pendiente".
        this.stopWatching();
        this.load();
      }
    });
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.loadBuild();
    }, POLL_MS);
  }

  private stopWatching(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.watchUntil = 0;
    this.watchSince = 0;
  }

  publishNow(): void {
    if (this.isSending()) return;
    this.isSending.set(true);

    this.rebuild.requestNow().subscribe({
      next: (result) => {
        this.isSending.set(false);
        if (result === 'requested') {
          this.toast.show('Publicacion pedida. En unos minutos se ven los cambios en el sitio.');
          // Se vigila el despliegue nuevo hasta que termine.
          this.stopWatching();
          this.watchSince = Date.now();
          this.watchUntil = this.watchSince + WATCH_AFTER_PUBLISH_MS;
          this.loadBuild();
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
