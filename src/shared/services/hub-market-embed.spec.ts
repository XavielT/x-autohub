import { SELECT_WITH_SELLER } from './hub-market.service';

/**
 * El embed del perfil del vendedor tiene que nombrar su clave foránea.
 *
 * Esta prueba existe por un fallo que llego a produccion y dejo Hub Market
 * **vacio**: la migracion 0012 agrego `reviewed_by`, con lo que
 * `hub_market_items` pasó a apuntar a `profiles` por dos caminos, y PostgREST
 * dejó de resolver `profiles(display_name)` — responde `PGRST201` y la consulta
 * entera falla.
 *
 * Lo grave no fue el error, sino que **nada lo enseñaba antes de desplegar**:
 * en modo simulado no hay PostgREST, el build no lo ve, y correr las
 * migraciones a mano tampoco, porque la ambigüedad la resuelve PostgREST y no
 * Postgres. La consulta solo falla contra la base real.
 *
 * Comprobar la forma de la cadena es poco, pero es lo unico que se puede
 * comprobar sin red. Si alguien la simplifica a `profiles(...)` —que es lo que
 * parece mas limpio— esto sale en rojo.
 */
describe('HubMarketService — embed del vendedor', () => {
  it('nombra la clave foranea, porque hay dos caminos a profiles', () => {
    expect(SELECT_WITH_SELLER).toContain('profiles!hub_market_items_seller_id_fkey');
  });

  it('no deja un embed ambiguo de profiles', () => {
    // `profiles(` sin `!` de por medio es exactamente lo que rompio produccion.
    expect(SELECT_WITH_SELLER).not.toMatch(/profiles\(/);
  });
});
