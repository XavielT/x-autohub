/**
 * Un cliente que se carga cuando se usa por primera vez, sin cambiar cómo se escribe cada consulta.
 *
 * `supabase-js` pesa unos 57 KB transferidos y, importado de forma estática, viaja en el JS inicial: el
 * navegador lo baja y lo ejecuta antes de que Angular arranque, y en un móvil con 4G lento eso se nota
 * en el LCP. Con `await import(...)` sale del bundle inicial, pero 157 consultas del proyecto escriben
 * `this.supabase.db.from('x').select().eq()...` en sentido sincrónico.
 *
 * Esto es un proxy que **graba la cadena** (`from` → `select` → `eq`…) y, cuando alguien la espera
 * (`await`, `.then`, `rxjs.from(...)`: el constructor de consultas de PostgREST es un "thenable" y no
 * hace nada hasta entonces), carga el cliente de verdad, **repite la cadena** sobre él y devuelve su
 * resultado. Una cadena que nadie espera no hace nada, igual que con el cliente real.
 *
 * Lo que NO puede hacer: devolver algo sincrónico (`getPublicUrl(...).data.publicUrl`,
 * `onAuthStateChange(...).data.subscription`). Esos casos usan `SupabaseService.client()`, que es una
 * promesa del cliente ya cargado. Hoy el único es `onAuthStateChange`.
 *
 * `hold` se llama al empezar a repetir la cadena y devuelve la función que la suelta: así el
 * prerenderizado cuenta la espera de la carga como tarea pendiente (si no, entre pedir la consulta y
 * que llegue el módulo no habría nada pendiente y Angular daría la página por lista, con "Cargando…").
 */
export function createLazyClient<T extends object>(load: () => Promise<T>, hold?: () => () => void): T {
  type Step = { kind: 'get'; prop: string | symbol } | { kind: 'call'; args: unknown[] };

  const replay = async (steps: readonly Step[]): Promise<unknown> => {
    const release = hold?.();
    try {
      let current: unknown = await load();
      let parent: unknown = undefined;
      for (const step of steps) {
        if (step.kind === 'get') {
          parent = current;
          current = (current as Record<string | symbol, unknown>)[step.prop];
        } else {
          current = (current as (...args: unknown[]) => unknown).apply(parent, step.args);
        }
      }
      // Si lo que quedó es un constructor de consultas o una promesa, esto espera su resultado.
      return await current;
    } finally {
      release?.();
    }
  };

  const make = (steps: readonly Step[]): unknown =>
    new Proxy(function lazyStep() {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            replay(steps).then(onFulfilled, onRejected);
        }
        // Los símbolos (`Symbol.observable`, `Symbol.iterator`, `Symbol.toPrimitive`…) son sondas de quien recibe el objeto, no parte de una
        // cadena. rxjs `from(db…)` pregunta por `Symbol.observable` y, si responde algo que es una función (el proxy lo es), lo llama y
        // revienta con algo que ni es un Error. Sin esto, ninguna consulta pasaba por `from()`.
        // rxjs usa la cadena '@@observable' cuando no hay `Symbol.observable`: mismo caso.
        if (typeof prop === 'symbol' || prop.startsWith('@@')) return undefined;
        return make([...steps, { kind: 'get', prop }]);
      },
      apply(_target, _thisArg, args) {
        return make([...steps, { kind: 'call', args }]);
      },
    });

  return make([]) as T;
}
