import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { HubMarketItemModel } from '../models/hub-market-item.model';
import { AuthService } from './auth.service';
import { HubMarketService } from './hub-market.service';

/**
 * Con Supabase de verdad, el trigger 0012 le respeta a un moderador el estado que mande y el valor por
 * defecto de la columna es `pendiente`: si el cliente no manda `aprobado`, hasta un admin queda en su
 * propia cola. Esto no lo ve el modo simulado (no tiene triggers), así que se mira lo que se inserta.
 */
describe('HubMarketService.publish (modo real)', () => {
  const ITEM: Omit<HubMarketItemModel, 'id'> = {
    category: 'accesorios',
    title: 'Kit',
    description: 'Descripción',
    price: 100,
    images: ['a.jpg'],
    location: 'Santiago',
    sellerName: 'Ana',
  };

  function montar() {
    const insert = vi.fn();
    const chain = {
      insert: (row: unknown) => {
        insert(row);
        return chain;
      },
      select: () => chain,
      single: () => Promise.resolve({ data: null, error: { message: 'x', code: 'x' } }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: () => null, canModerate: () => false } },
        { provide: SupabaseService, useValue: { shouldUseMockData: () => false, db: { from: () => chain } } },
      ],
    });
    return { service: TestBed.inject(HubMarketService), insert };
  }

  it('un moderador manda `aprobado`', async () => {
    const { service, insert } = montar();
    await firstValueFrom(service.publish(ITEM, 'u1', 'Ana', true)).catch(() => undefined);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'aprobado' }));
  });

  it('cualquier otra persona no manda estado (lo fuerza el trigger)', async () => {
    const { service, insert } = montar();
    await firstValueFrom(service.publish(ITEM, 'u1', 'Ana', false)).catch(() => undefined);
    expect(insert.mock.calls[0][0]).not.toHaveProperty('status');
  });
});
