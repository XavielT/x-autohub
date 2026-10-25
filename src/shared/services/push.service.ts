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

/** A qué se suscribe quien no tiene cuenta: a un pedido o a una cita (migraciones 0034 y 0035). */
export type GuestPushKind = 'order' | 'appointment';

export interface GuestPushTarget {
  kind: GuestPushKind;
  /** El uuid del pedido o de la cita: es la llave. */
  id: string;
}

/** Dónde se anotan, en este navegador, los pedidos y citas con avisos activados (el navegador solo sabe del dispositivo, no de ellos). */
const GUEST_PUSH_KEYS: Record<GuestPushKind, string> = {
  order: 'xah.orderPush',
  appointment: 'xah.appointmentPush',
};
const GUEST_PUSH_MAX = 20;

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
    this.state.set(await this.readDevice());
  }

  /** El estado del dispositivo, sin tocar la señal: lo comparten los avisos de la cuenta y los de un pedido. */
  private async readDevice(): Promise<PushState> {
    const win = this.doc.defaultView;

    if (this.supabase.shouldUseMockData() || !this.publicKey) return 'unsupported';
    // En iPhone sin instalar no existe `PushManager`: se distingue para poder explicarlo.
    if (isIosSafari(win) && !isStandalone(win)) return 'needs-install';
    if (!this.canPush) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';

    try {
      const subscription = await firstValueFrom(this.swPush!.subscription);
      return subscription ? 'on' : 'off';
    } catch {
      return 'off';
    }
  }

  // --- Avisos de un pedido o una cita de invitado (migraciones 0034 y 0035) ----------------------------------------

  /** Los pedidos o citas de invitado de este navegador con avisos activados. Nunca falla: sin almacenamiento, vacío. */
  private readGuestIds(kind: GuestPushKind): string[] {
    try {
      const raw = this.doc.defaultView?.localStorage.getItem(GUEST_PUSH_KEYS[kind]);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  private writeGuestIds(kind: GuestPushKind, ids: string[]): void {
    try {
      this.doc.defaultView?.localStorage.setItem(GUEST_PUSH_KEYS[kind], JSON.stringify(ids.slice(-GUEST_PUSH_MAX)));
    } catch {
      // Sin almacenamiento el aviso sigue funcionando; solo no se recuerda que está activo.
    }
  }

  /**
   * El estado de los avisos de **este pedido o esta cita** en este dispositivo. El navegador tiene una sola suscripción por
   * dispositivo, que puede servir a varios pedidos y citas (o a una cuenta); por eso "activo" exige también que este esté
   * anotado como activado aquí.
   */
  async guestState(target: GuestPushTarget): Promise<PushState> {
    const device = await this.readDevice();
    return device === 'on' && !this.readGuestIds(target.kind).includes(target.id) ? 'off' : device;
  }

  /** Pide permiso, se suscribe y registra el dispositivo en ese pedido o cita. */
  async enableForGuest(target: GuestPushTarget): Promise<PushResult> {
    if (!this.canPush) return { ok: false, message: 'Este dispositivo no puede recibir avisos.' };

    try {
      const subscription = await this.swPush!.requestSubscription({ serverPublicKey: this.publicKey });
      const { endpoint, keys } = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        throw new Error('El navegador no entregó la suscripción completa.');
      }

      const device = {
        p_endpoint: endpoint,
        p_p256dh: keys.p256dh,
        p_auth: keys.auth,
        p_user_agent: this.doc.defaultView?.navigator.userAgent ?? '',
      };
      // Dos llamadas y no una con el nombre en una variable: `rpc` tipa cada función por su nombre.
      const saved =
        target.kind === 'order'
          ? await this.supabase.db.rpc('register_order_push', { p_order_id: target.id, ...device })
          : await this.supabase.db.rpc('register_appointment_push', { p_appointment_id: target.id, ...device });
      if (saved.error) unwrap({ data: null, error: saved.error });

      this.writeGuestIds(target.kind, [...this.readGuestIds(target.kind).filter((id) => id !== target.id), target.id]);
      return { ok: true };
    } catch (error) {
      if ((await this.readDevice()) === 'blocked') {
        return {
          ok: false,
          message: 'Los avisos están bloqueados en este navegador. Actívalos desde la configuración del sitio.',
        };
      }
      console.warn('[push] no se pudieron activar los avisos', error);
      // Los mensajes de la base (de una cuenta, ya terminado, demasiados dispositivos) están en español y sirven tal cual.
      const message = error instanceof Error && error.message ? error.message : '';
      return { ok: false, message: message || 'No pudimos activar los avisos. Intenta de nuevo.' };
    }
  }

  /**
   * Quita este dispositivo de ese pedido o cita. La suscripción del navegador se deja: puede servir a otro pedido, a otra
   * cita o a una cuenta, y sin filas en la base no recibe nada.
   */
  async disableForGuest(target: GuestPushTarget): Promise<PushResult> {
    if (!this.canPush) return { ok: false, message: 'Este dispositivo no puede recibir avisos.' };

    try {
      const subscription = await firstValueFrom(this.swPush!.subscription);
      if (subscription) {
        const removed =
          target.kind === 'order'
            ? await this.supabase.db.rpc('unregister_order_push', { p_order_id: target.id, p_endpoint: subscription.endpoint })
            : await this.supabase.db.rpc('unregister_appointment_push', { p_appointment_id: target.id, p_endpoint: subscription.endpoint });
        if (removed.error) unwrap({ data: null, error: removed.error });
      }
      this.writeGuestIds(target.kind, this.readGuestIds(target.kind).filter((id) => id !== target.id));
      return { ok: true };
    } catch (error) {
      console.warn('[push] no se pudieron desactivar los avisos', error);
      return { ok: false, message: 'No pudimos desactivar los avisos. Intenta de nuevo.' };
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
