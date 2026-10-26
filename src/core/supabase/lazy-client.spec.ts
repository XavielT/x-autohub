import { firstValueFrom, from } from 'rxjs';
import { createLazyClient } from './lazy-client';

/** Un cliente de mentira con la misma forma de cadena que supabase-js: `from().select().eq()` y un `then` al final. */
function fakeClient() {
  const calls: string[] = [];
  const builder = (log: string[]) => ({
    select(cols: string) { return builder([...log, `select(${cols})`]); },
    eq(col: string, val: unknown) { return builder([...log, `eq(${col},${val})`]); },
    then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) {
      calls.push(log.join('.'));
      return Promise.resolve({ data: log, error: null }).then(ok, bad);
    },
  });
  return {
    calls,
    client: {
      from(table: string) { return builder([`from(${table})`]); },
      rpc(name: string) { return builder([`rpc(${name})`]); },
      auth: {
        async getSession() { return { data: { session: 'S' } }; },
        onAuthStateChange(cb: () => void) { cb(); return { data: { subscription: 'sub' } }; },
      },
      failing() { return Promise.reject(new Error('fallo de red')); },
    },
  };
}

describe('createLazyClient', () => {
  it('no carga nada hasta que alguien espera la cadena', async () => {
    const load = vi.fn(async () => fakeClient().client);
    const db = createLazyClient(load);
    db.from('hub_parts').select('*').eq('id', 1);
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
  });

  it('repite la cadena completa sobre el cliente real al esperarla', async () => {
    const f = fakeClient();
    const db = createLazyClient(async () => f.client);
    const res = (await db.from('hub_parts').select('id, name').eq('slug', 'x')) as unknown as { data: string[] };
    expect(res.data).toEqual(['from(hub_parts)', 'select(id, name)', 'eq(slug,x)']);
    expect(f.calls).toEqual(['from(hub_parts).select(id, name).eq(slug,x)']);
  });

  it('carga el cliente una sola vez aunque haya varias consultas', async () => {
    const f = fakeClient();
    let loads = 0;
    const shared = Promise.resolve(f.client);
    const db = createLazyClient(() => { loads++; return shared; });
    await db.from('a').select('*');
    await db.from('b').select('*');
    expect(loads).toBe(2); // `load` se llama por consulta: la memoria va en quien lo provee (SupabaseService)
    expect(f.calls).toHaveLength(2);
  });

  it('las llamadas llevan el `this` correcto (auth.getSession) y funciona con rpc', async () => {
    const f = fakeClient();
    const db = createLazyClient(async () => f.client);
    expect(await db.auth.getSession()).toEqual({ data: { session: 'S' } });
    const r = (await db.rpc('coupon_check')) as unknown as { data: string[] };
    expect(r.data).toEqual(['rpc(coupon_check)']);
  });

  it('un rechazo del cliente real llega al que espera, y .then(ok, err) lo recibe', async () => {
    const f = fakeClient();
    const db = createLazyClient(async () => f.client);
    // `Promise.resolve`: vitest llama a lo que sea una función (el objetivo del proxy lo es) antes de mirar si es una promesa.
    await expect(Promise.resolve(db.failing())).rejects.toThrow('fallo de red');
    const visto = await new Promise((resolve) => db.failing().then(() => resolve('ok'), (e: Error) => resolve(e.message)));
    expect(visto).toBe('fallo de red');
  });

  it('si la carga del módulo falla, quien espera recibe el error', async () => {
    const db = createLazyClient<ReturnType<typeof fakeClient>['client']>(async () => { throw new Error('sin red'); });
    await expect(Promise.resolve(db.from('x').select('*'))).rejects.toThrow('sin red');
  });

  it('hold se pide al empezar y se suelta al terminar, también si falla', async () => {
    const f = fakeClient();
    const release = vi.fn();
    const hold = vi.fn(() => release);
    const db = createLazyClient(async () => f.client, hold);
    await db.from('x').select('*');
    expect(hold).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);

    const malo = createLazyClient<ReturnType<typeof fakeClient>['client']>(async () => { throw new Error('x'); }, hold);
    await expect(Promise.resolve(malo.from('x'))).rejects.toThrow();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('funciona con rxjs from(), que es como lo usan los servicios (sondea Symbol.observable)', async () => {
    const f = fakeClient();
    const db = createLazyClient(async () => f.client);
    const res = (await firstValueFrom(from(db.from('hub_parts').select('*').eq('id', 7) as unknown as PromiseLike<unknown>))) as unknown as { data: string[] };
    expect(res.data).toEqual(['from(hub_parts)', 'select(*)', 'eq(id,7)']);
  });

  it('un símbolo no es parte de la cadena', () => {
    const db = createLazyClient(async () => fakeClient().client) as unknown as Record<symbol, unknown>;
    expect(db[Symbol.iterator]).toBeUndefined();
    expect((db as unknown as Record<string, unknown>)['@@observable']).toBeUndefined();
    expect(db[Symbol.toPrimitive]).toBeUndefined();
  });
});
