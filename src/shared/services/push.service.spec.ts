import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { PushService } from './push.service';

/**
 * Los avisos push desde el navegador. Las pruebas corren en modo simulado, así que aquí se
 * sustituye `SupabaseService` por uno "real" de mentira y `SwPush` por un doble: lo que se
 * fija es qué se le pide a cada uno y en qué orden, no el servicio de push de verdad.
 */
describe('PushService', () => {
  const rpc = vi.fn();
  const deleteEq = vi.fn();
  const invoke = vi.fn();
  const db = {
    rpc,
    from: vi.fn(() => ({ delete: () => ({ eq: deleteEq }) })),
    functions: { invoke },
  };

  const KEYS = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
  const subscription = (endpoint = 'https://push.example/abc') => ({
    endpoint,
    toJSON: () => ({ endpoint, keys: KEYS }),
  });

  let current: ReturnType<typeof subscription> | null;
  let sw: {
    isEnabled: boolean;
    subscription: BehaviorSubject<ReturnType<typeof subscription> | null>;
    requestSubscription: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };

  const originalKey = environment.vapidPublicKey;
  const originalPermission = Object.getOwnPropertyDescriptor(globalThis, 'Notification');

  function montar(options: { mock?: boolean; swEnabled?: boolean; permission?: NotificationPermission } = {}) {
    const { mock = false, swEnabled = true, permission = 'default' } = options;
    current = null;
    sw = {
      isEnabled: swEnabled,
      subscription: new BehaviorSubject<ReturnType<typeof subscription> | null>(null),
      requestSubscription: vi.fn(async () => {
        const s = subscription();
        sw.subscription.next(s);
        return s;
      }),
      unsubscribe: vi.fn(async () => sw.subscription.next(null)),
    };
    // Un navegador con Web Push: el doble de Notification y de PushManager.
    Object.defineProperty(globalThis, 'Notification', { value: { permission }, configurable: true, writable: true });
    Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true, writable: true });

    TestBed.configureTestingModule({
      providers: [
        { provide: SwPush, useValue: sw },
        { provide: SupabaseService, useValue: { shouldUseMockData: () => mock, db } },
      ],
    });
    return TestBed.inject(PushService);
  }

  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: null, error: null });
    deleteEq.mockReset().mockResolvedValue({ data: null, error: null });
    invoke.mockReset().mockResolvedValue({ data: { sent: 1 }, error: null });
    (environment as { vapidPublicKey?: string }).vapidPublicKey = 'PUBLICA';
  });

  afterEach(() => {
    (environment as { vapidPublicKey?: string }).vapidPublicKey = originalKey;
    if (originalPermission) Object.defineProperty(globalThis, 'Notification', originalPermission);
    else delete (globalThis as { Notification?: unknown }).Notification;
    delete (window as { PushManager?: unknown }).PushManager;
  });

  describe('refresh()', () => {
    it('en modo simulado no se ofrece', async () => {
      const service = montar({ mock: true });
      await service.refresh();
      expect(service.state()).toBe('unsupported');
    });

    it('sin la clave del sitio configurada no se ofrece', async () => {
      (environment as { vapidPublicKey?: string }).vapidPublicKey = '';
      const service = montar();
      await service.refresh();
      expect(service.state()).toBe('unsupported');
    });

    it('sin service worker (desarrollo) no se ofrece', async () => {
      const service = montar({ swEnabled: false });
      await service.refresh();
      expect(service.state()).toBe('unsupported');
    });

    it('sin suscripción: se puede activar', async () => {
      const service = montar();
      await service.refresh();
      expect(service.state()).toBe('off');
    });

    it('con suscripción: ya está activo', async () => {
      const service = montar();
      sw.subscription.next(subscription());
      await service.refresh();
      expect(service.state()).toBe('on');
    });

    it('si el permiso está denegado, lo dice: solo la persona lo puede cambiar', async () => {
      const service = montar({ permission: 'denied' });
      await service.refresh();
      expect(service.state()).toBe('blocked');
    });
  });

  describe('enable()', () => {
    it('se suscribe con la clave del sitio y guarda el dispositivo por la función', async () => {
      const service = montar();
      const result = await service.enable();

      expect(result.ok).toBe(true);
      expect(sw.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'PUBLICA' });
      expect(rpc).toHaveBeenCalledWith('register_push_subscription', {
        p_endpoint: 'https://push.example/abc',
        p_p256dh: KEYS.p256dh,
        p_auth: KEYS.auth,
        p_user_agent: expect.any(String),
      });
      expect(service.state()).toBe('on');
    });

    it('si la base rechaza el dispositivo, no queda como activado', async () => {
      rpc.mockResolvedValue({ data: null, error: { message: 'boom', code: '42501', details: '', hint: '' } });
      const service = montar();

      const result = await service.enable();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('No pudimos activar');
      // Se deshace la suscripción del navegador: el servidor no la conoce.
      expect(sw.unsubscribe).toHaveBeenCalled();
      expect(service.state()).toBe('off');
    });

    it('si la persona dice "No permitir", queda bloqueado y se explica', async () => {
      const service = montar();
      sw.requestSubscription.mockImplementation(async () => {
        (Notification as unknown as { permission: string }).permission = 'denied';
        throw new Error('permiso denegado');
      });

      const result = await service.enable();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('bloqueados');
      expect(service.state()).toBe('blocked');
      expect(rpc).not.toHaveBeenCalled();
    });

    it('una suscripción incompleta no se guarda', async () => {
      const service = montar();
      sw.requestSubscription.mockResolvedValue({ endpoint: 'https://x', toJSON: () => ({ endpoint: 'https://x' }) });

      const result = await service.enable();

      expect(result.ok).toBe(false);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('donde no se puede, no intenta nada', async () => {
      const service = montar({ mock: true });
      const result = await service.enable();

      expect(result.ok).toBe(false);
      expect(sw.requestSubscription).not.toHaveBeenCalled();
    });
  });

  describe('disable()', () => {
    it('quita la suscripción del navegador y borra el dispositivo de la base', async () => {
      const service = montar();
      sw.subscription.next(subscription('https://push.example/mio'));
      await service.refresh();

      const result = await service.disable();

      expect(result.ok).toBe(true);
      expect(sw.unsubscribe).toHaveBeenCalled();
      expect(deleteEq).toHaveBeenCalledWith('endpoint', 'https://push.example/mio');
      expect(service.state()).toBe('off');
    });

    it('sin suscripción no toca la base y queda apagado', async () => {
      const service = montar();

      const result = await service.disable();

      expect(result.ok).toBe(true);
      expect(deleteEq).not.toHaveBeenCalled();
      expect(service.state()).toBe('off');
    });
  });

  describe('notify() (lo que usa el panel)', () => {
    it('le pide a send-push avisar de un pedido o de una cita, solo con el id', async () => {
      const service = montar();

      await service.notify('order', 'abc');
      await service.notify('appointment', 'def');

      expect(invoke).toHaveBeenNthCalledWith(1, 'send-push', { body: { kind: 'order', id: 'abc' } });
      expect(invoke).toHaveBeenNthCalledWith(2, 'send-push', { body: { kind: 'appointment', id: 'def' } });
    });

    it('en modo simulado no hace nada', async () => {
      const service = montar({ mock: true });

      await service.notify('order', 'abc');

      expect(invoke).not.toHaveBeenCalled();
    });

    it('sin la clave del sitio tampoco llama a la función', async () => {
      (environment as { vapidPublicKey?: string }).vapidPublicKey = '';
      const service = montar();

      await service.notify('order', 'abc');

      expect(invoke).not.toHaveBeenCalled();
    });

    it('nunca falla, ni con un error de la función ni con una excepción', async () => {
      const service = montar();
      invoke.mockResolvedValueOnce({ data: null, error: new Error('500') });
      await expect(service.notify('order', 'abc')).resolves.toBeUndefined();

      invoke.mockRejectedValueOnce(new Error('sin red'));
      await expect(service.notify('order', 'abc')).resolves.toBeUndefined();
    });
  });
});
