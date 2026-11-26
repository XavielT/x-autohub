import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { SupabaseService } from '../../core/supabase/supabase.service';
import { AdminService, assertTouched } from './admin.service';

/**
 * "Marcar prueba" (y ocultar, precio, stock…) guardaba el cambio pero el panel decía "No encontramos lo que buscabas":
 * un `update` sin `.select()` responde con `data: null`, y `unwrap()` lo toma por "no hay nada". Esta base de mentira
 * contesta como PostgREST: **sin datos** si no se pidió `.select()`, y con las filas tocadas si se pidió.
 */
describe('AdminService: escrituras del inventario (modo real)', () => {
  function montar(touchedRows: { id: number }[]) {
    const calls: { table: string; selected: string | null; update: unknown }[] = [];

    const db = {
      from: (table: string) => {
        const call = { table, selected: null as string | null, update: null as unknown };
        calls.push(call);
        const chain = {
          update: (value: unknown) => {
            call.update = value;
            return chain;
          },
          eq: () => chain,
          select: (columns: string) => {
            call.selected = columns;
            return chain;
          },
          // Es "thenable", como el constructor de PostgREST: se ejecuta al esperarlo.
          then: (resolve: (r: unknown) => void) =>
            resolve(call.selected === null ? { data: null, error: null } : { data: touchedRows, error: null }),
        };
        return chain;
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { shouldUseMockData: () => false, db } }],
    });
    return { service: TestBed.inject(AdminService), calls };
  }

  it('marcar una pieza como de prueba termina bien y pide de vuelta la fila tocada', async () => {
    const { service, calls } = montar([{ id: 31 }]);
    await expect(firstValueFrom(service.updatePart(31, { isTest: true }))).resolves.toBeUndefined();
    expect(calls[0].update).toEqual({ is_test: true });
    expect(calls[0].selected).toBe('id');
  });

  it('lo mismo para vehículos y noticias', async () => {
    const { service } = montar([{ id: 1 }]);
    await expect(firstValueFrom(service.updateVehicle(1, { isTest: true }))).resolves.toBeUndefined();
    await expect(firstValueFrom(service.updateNews(1, { isTest: true }))).resolves.toBeUndefined();
  });

  it('si RLS no deja escribir (cero filas tocadas) lo dice, en vez de fingir que funcionó', async () => {
    const { service } = montar([]);
    await expect(firstValueFrom(service.updatePart(31, { isTest: true }))).rejects.toThrow(/permiso/);
  });

  it('assertTouched deja pasar si tocó algo y falla si no', () => {
    expect(() => assertTouched([{ id: 1 }])).not.toThrow();
    expect(() => assertTouched([])).toThrow(/permiso/);
  });
});
