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

  describe('avisos de un pedido de invitado', () => {
    const ORDER = '11111111-1111-4111-8111-111111111111';
    const OTHER = '22222222-2222-4222-8222-222222222222';

    beforeEach(() => localStorage.removeItem('xah.orderPush'));
    afterEach(() => localStorage.removeItem('xah.orderPush'));

    it('orderState: sin suscripción en el navegador se puede activar', async () => {
      const service = montar();
      expect(await service.orderState(ORDER)).toBe('off');
    });

    it('orderState: con suscripción pero sin este pedido anotado sigue apagado (la suscripción es del dispositivo)', async () => {
      const service = montar();
      sw.subscription.next(subscription());
      expect(await service.orderState(ORDER)).toBe('off');
    });

    it('orderState: simulado, sin clave o con el permiso denegado, igual que los avisos de la cuenta', async () => {
      expect(await montar({ mock: true }).orderState(ORDER)).toBe('unsupported');
      TestBed.resetTestingModule();
      expect(await montar({ permission: 'denied' }).orderState(ORDER)).toBe('blocked');
    });

    it('enableForOrder: se suscribe, registra el dispositivo en ese pedido y lo anota como activo', async () => {
      const service = montar();

      const result = await service.enableForOrder(ORDER);

      expect(result.ok).toBe(true);
      expect(sw.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'PUBLICA' });
      expect(rpc).toHaveBeenCalledWith('register_order_push', {
        p_order_id: ORDER,
        p_endpoint: 'https://push.example/abc',
        p_p256dh: KEYS.p256dh,
        p_auth: KEYS.auth,
        p_user_agent: expect.any(String),
      });
      expect(await service.orderState(ORDER)).toBe('on');
      // Otro pedido en el mismo dispositivo no queda activo por arrastre.
      expect(await service.orderState(OTHER)).toBe('off');
    });

    it('enableForOrder: si la base lo rechaza, no queda activo y se dice por qué', async () => {
      rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Este pedido es de una cuenta: inicia sesion y activa los avisos desde tu perfil.' } });
      const service = montar();

      const result = await service.enableForOrder(ORDER);

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Este pedido es de una cuenta');
      expect(await service.orderState(ORDER)).toBe('off');
    });

    it('enableForOrder: si la persona dice "No permitir", se explica', async () => {
      const service = montar();
      sw.requestSubscription.mockImplementation(async () => {
        Object.defineProperty(globalThis, 'Notification', { value: { permission: 'denied' }, configurable: true, writable: true });
        throw new Error('NotAllowedError');
      });

      const result = await service.enableForOrder(ORDER);

      expect(result.ok).toBe(false);
      expect(result.message).toContain('bloqueados');
    });

    it('enableForOrder: donde no se puede, no intenta nada', async () => {
      const service = montar({ mock: true });
      const result = await service.enableForOrder(ORDER);
      expect(result.ok).toBe(false);
      expect(sw.requestSubscription).not.toHaveBeenCalled();
    });

    it('disableForOrder: quita el dispositivo de ese pedido, lo deja de anotar y NO desuscribe el navegador', async () => {
      const service = montar();
      await service.enableForOrder(ORDER);
      await service.enableForOrder(OTHER);

      const result = await service.disableForOrder(ORDER);

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith('unregister_order_push', { p_order_id: ORDER, p_endpoint: 'https://push.example/abc' });
      expect(sw.unsubscribe).not.toHaveBeenCalled();
      expect(await service.orderState(ORDER)).toBe('off');
      expect(await service.orderState(OTHER)).toBe('on');
    });

    it('sin almacenamiento disponible no se rompe', async () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
      const service = montar();

      const result = await service.enableForOrder(ORDER);

      expect(result.ok).toBe(true);
      spy.mockRestore();
    });
  });
});
