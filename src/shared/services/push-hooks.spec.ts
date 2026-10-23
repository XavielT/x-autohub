import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { AdminService } from './admin.service';
import { AdminServicesService } from './admin-services.service';
import { PushService } from './push.service';

/**
 * El panel avisa al cliente **solo** cuando el cambio de estado salió bien. Se prueba por el
 * camino "real" (con un Supabase de mentira) porque en modo simulado no hay a quién avisar.
 */
describe('avisos al cambiar el estado desde el panel', () => {
  const notify = vi.fn().mockResolvedValue(undefined);
  const rpc = vi.fn();

  beforeEach(() => {
    notify.mockClear();
    rpc.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { shouldUseMockData: () => false, db: { rpc } } },
        { provide: PushService, useValue: { notify } },
      ],
    });
  });

  it('un pedido que cambió de estado avisa a su dueño, con el id', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'p-1' }], error: null });

    await firstValueFrom(TestBed.inject(AdminService).setOrderStatus('p-1', 'shipped'));

    expect(rpc).toHaveBeenCalledWith('set_order_status', { p_order_id: 'p-1', p_to: 'shipped', p_note: null });
    expect(notify).toHaveBeenCalledWith('order', 'p-1');
  });

  it('si el cambio de estado falla, no se avisa de nada', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'no', code: '22023', details: '', hint: '' } });

    await expect(firstValueFrom(TestBed.inject(AdminService).setOrderStatus('p-1', 'shipped'))).rejects.toThrow();

    expect(notify).not.toHaveBeenCalled();
  });

  it('una cita confirmada avisa a su dueño', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'c-1' }], error: null });

    await firstValueFrom(TestBed.inject(AdminServicesService).setAppointmentStatus('c-1', 'confirmed'));

    expect(notify).toHaveBeenCalledWith('appointment', 'c-1');
  });

  it('si el cambio de la cita falla, tampoco', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'no', code: '22023', details: '', hint: '' } });

    await expect(
      firstValueFrom(TestBed.inject(AdminServicesService).setAppointmentStatus('c-1', 'confirmed')),
    ).rejects.toThrow();

    expect(notify).not.toHaveBeenCalled();
  });
});
