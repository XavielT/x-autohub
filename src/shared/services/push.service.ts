import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { unwrap } from '../../core/supabase/supabase-error';
import { isIosSafari, isStandalone } from '../utils/pwa-env';

/**
 * Cómo está este dispositivo respecto a los avisos:
 *
 *   · `unsupported`: no se pueden activar aquí (desarrollo, modo simulado, un navegador sin
 *     Web Push, o la clave del sitio sin configurar).
 *   · `needs-install`: iPhone/iPad en Safari. iOS solo manda avisos a una app **instalada**
 *     en la pantalla de inicio (iOS 16.4+), así que hay que instalarla primero.
 *   · `blocked`: la persona dijo "No permitir" en el navegador; solo ella lo puede cambiar.
 *   · `off` / `on`: se pueden activar / ya están activos.
 */
export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

export interface PushResult {
  ok: boolean;
  /** Qué decirle a la persona si no salió. */
  message?: string;
}

/**
 * Avisos al dispositivo (Web Push): activarlos y desactivarlos.
 *
 * Es el lado del navegador. Guardar el dispositivo es `register_push_subscription()`; avisar de un
 * cambio de estado lo pide la base con un trigger (migración 0028) a la Edge Function `send-push`
 * (ver `docs/BACKEND.md`). El service worker de Angular
 * muestra el aviso y abre la ruta al tocarlo; aquí no hay código para eso.
 *
 * `SwPush` es opcional a propósito: en desarrollo y en las pruebas no hay service worker.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly swPush = inject(SwPush, { optional: true });
  private readonly supabase = inject(SupabaseService);
  private readonly doc = inject(DOCUMENT);

  readonly state = signal<PushState>('unsupported');

  /** La clave pública VAPID del sitio. Vacía = los avisos no están configurados. */
  private readonly publicKey = environment.vapidPublicKey ?? '';

  /** ¿Este navegador puede recibir avisos y el sitio los tiene configurados? */
  private get canPush(): boolean {
    const win = this.doc.defaultView;
    return (
      !!this.publicKey &&
      !this.supabase.shouldUseMockData() &&
      !!this.swPush?.isEnabled &&
      !!win &&
      'Notification' in win &&
      'PushManager' in win
    );
  }

  /** Mira el estado real del dispositivo. Se llama al abrir la sección de avisos. */
  async refresh(): Promise<void> {
    const win = this.doc.defaultView;

    if (this.supabase.shouldUseMockData() || !this.publicKey) {
      this.state.set('unsupported');
      return;
    }
    // En iPhone sin instalar no existe `PushManager`: se distingue para poder explicarlo.
    if (isIosSafari(win) && !isStandalone(win)) {
      this.state.set('needs-install');
      return;
    }
    if (!this.canPush) {
      this.state.set('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      this.state.set('blocked');
      return;
    }

    try {
      const subscription = await firstValueFrom(this.swPush!.subscription);
      this.state.set(subscription ? 'on' : 'off');
    } catch {
      this.state.set('off');
    }
  }

  /** Pide permiso, se suscribe y guarda el dispositivo en la base. */
  async enable(): Promise<PushResult> {
    if (!this.canPush) return { ok: false, message: 'Este dispositivo no puede recibir avisos.' };

    let subscribed = false;
    try {
      const subscription = await this.swPush!.requestSubscription({ serverPublicKey: this.publicKey });
      subscribed = true;
      const { endpoint, keys } = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        throw new Error('El navegador no entregó la suscripción completa.');
      }

      const saved = await this.supabase.db.rpc('register_push_subscription', {
        p_endpoint: endpoint,
        p_p256dh: keys.p256dh,
        p_auth: keys.auth,
        p_user_agent: this.doc.defaultView?.navigator.userAgent ?? '',
      });
      // La función no devuelve nada: `unwrap` pediría datos, así que solo se traduce el error.
      if (saved.error) unwrap({ data: null, error: saved.error });
      this.state.set('on');
      return { ok: true };
    } catch (error) {
      // Si el navegador ya se suscribió pero la base no lo guardó, se deshace: una suscripción
      // que el servidor no conoce haría ver "activado" un dispositivo al que nunca se le avisa.
      if (subscribed) await this.swPush!.unsubscribe().catch(() => undefined);
      await this.refresh();
      if (this.state() === 'blocked') {
        return {
          ok: false,
          message: 'Los avisos están bloqueados en este navegador. Actívalos desde la configuración del sitio.',
        };
      }
      console.warn('[push] no se pudieron activar los avisos', error);
      return { ok: false, message: 'No pudimos activar los avisos. Intenta de nuevo.' };
    }
  }

  /** Quita la suscripción del navegador y borra el dispositivo de la base. */
  async disable(): Promise<PushResult> {
    if (!this.canPush) return { ok: false, message: 'Este dispositivo no puede recibir avisos.' };

    try {
      const subscription = await firstValueFrom(this.swPush!.subscription);
      if (subscription) {
        const endpoint = subscription.endpoint;
        await this.swPush!.unsubscribe();
        const removed = await this.supabase.db.from('push_subscriptions').delete().eq('endpoint', endpoint);
        if (removed.error) unwrap({ data: null, error: removed.error });
      }
      this.state.set('off');
      return { ok: true };
    } catch (error) {
      console.warn('[push] no se pudieron desactivar los avisos', error);
      return { ok: false, message: 'No pudimos desactivar los avisos. Intenta de nuevo.' };
    }
  }
}
