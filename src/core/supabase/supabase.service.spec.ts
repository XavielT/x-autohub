import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';

/**
 * El cliente de Supabase tal como se arma de verdad (los demás specs usan `TestSupabaseService`,
 * que lo apaga). Lo que se fija es el `fetch` que se le entrega: en el navegador no cambia nada,
 * y en el servidor (el prerenderizado del build) lee el cuerpo antes de dar la consulta por
 * terminada, para que Angular no guarde la página antes de tener sus datos.
 */
describe('SupabaseService (el fetch del cliente)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let clone: ReturnType<typeof vi.fn>;
  const original = globalThis.fetch;

  function montar(platform: 'browser' | 'server') {
    clone = vi.fn(() => ({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }));
    fetchSpy = vi.fn(async () => {
      const response = new Response('[{"id":1}]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      response.clone = clone as unknown as () => Response;
      return response;
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useClass: SupabaseService }, { provide: PLATFORM_ID, useValue: platform }],
    });
    return TestBed.inject(SupabaseService);
  }

  afterEach(() => {
    globalThis.fetch = original;
  });

  it('en el navegador entrega la respuesta tal cual, sin leerla dos veces', async () => {
    const supabase = montar('browser');

    const res = await supabase.db.from('hub_parts').select('id').limit(1);

    expect(res.error).toBeNull();
    expect(fetchSpy).toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
  });

  it('en el servidor lee el cuerpo antes de soltar la tarea, y quien llama sigue pudiendo leerlo', async () => {
    const supabase = montar('server');

    const res = await supabase.db.from('hub_parts').select('id').limit(1);

    expect(clone).toHaveBeenCalledTimes(1);
    expect(res.error).toBeNull();
    expect(res.data).toEqual([{ id: 1 }]);
  });

  it('el cliente se crea una sola vez', () => {
    const supabase = montar('browser');

    expect(supabase.db).toBe(supabase.db);
  });
});
