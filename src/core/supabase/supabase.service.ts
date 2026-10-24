import { Injectable, PLATFORM_ID, PendingTasks, inject } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Database } from './database.types';

/**
 * Cuánto se sostiene una consulta como "pendiente" después de terminar, solo al prerenderizar. Es lo
 * que tarda la página en reaccionar a lo que llegó: pintar y, si el componente que apareció pide
 * más datos (las reseñas de una ficha), registrar esa consulta antes de que el contador llegue a cero.
 */
const SERVER_SETTLE_MS = 50;

/**
 * Un `WebSocket` que no existe. El cliente de Supabase pide uno al crearse aunque nadie use
 * tiempo real, y Node 20 (donde corre el prerenderizado del build) no trae `WebSocket`: sin esto
 * lanza al instanciarse. La app no usa Realtime, así que nunca se llega a construir.
 */
class NoWebSocket {
  constructor() {
    throw new Error('Realtime no está disponible en este entorno.');
  }
}

/**
 * Punto único de acceso a Supabase.
 *
 * El cliente se crea de forma perezosa: si el proyecto no está configurado
 * (`supabaseUrl` vacío), nunca se instancia y la app trabaja con mocks. Eso
 * permite clonar el repo y correrlo sin credenciales.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client: SupabaseClient<Database> | null = null;
  private readonly pendingTasks = inject(PendingTasks);
  // `isPlatformServer` es esta misma comparación; se hace a mano para no importar `@angular/common`
  // en un archivo que casi todo el proyecto carga el primero (rompe el arranque de las pruebas).
  private readonly isServer = inject(PLATFORM_ID) === 'server';

  /** true cuando hay URL y clave anon configuradas. */
  readonly isConfigured =
    environment.supabaseUrl.length > 0 && environment.supabaseAnonKey.length > 0;

  /**
   * Cliente de Supabase. Lanza si se pide sin configuración — los servicios
   * deben consultar `shouldUseMockData()` antes de llegar aquí.
   */
  get db(): SupabaseClient<Database> {
    if (!this.isConfigured) {
      throw new Error(
        'Supabase no está configurado. Define supabaseUrl y supabaseAnonKey en ' +
          'src/environments/environment.ts (ver docs/BACKEND.md).',
      );
    }

    this.client ??= createClient<Database>(
      environment.supabaseUrl,
      environment.supabaseAnonKey,
      {
        auth: {
          // La sesión sobrevive al refresh y se renueva sola.
          persistSession: true,
          autoRefreshToken: true,
          // Necesario para el enlace de confirmación de correo.
          detectSessionInUrl: true,
          storageKey: 'x-autohub.auth',
        },
        realtime: typeof WebSocket === 'undefined' ? { transport: NoWebSocket as never } : {},
        global: {
          // Cada consulta cuenta como "tarea pendiente": al prerenderizar, Angular espera a que
          // terminen antes de guardar el HTML (la app no usa zone.js, que es lo que antes las
          // contaba). En el navegador no cambia nada.
          //
          // En el servidor no basta con que `fetch` responda: el cuerpo se lee después y la
          // página arma su contenido con lo que llega, y una consulta suele disparar la
          // siguiente (la ficha pide el producto y, con él, la compatibilidad y las opciones).
          // Por eso ahí se lee el cuerpo antes de soltar la tarea, y se suelta un turno después
          // (`setTimeout`): así la consulta siguiente ya registró la suya y el contador nunca
          // pasa por cero entre las dos, que es cuando Angular daría la página por lista.
          fetch: async (input, init) => {
            const done = this.pendingTasks.add();
            try {
              const response = await fetch(input, init);
              if (this.isServer) await response.clone().arrayBuffer().catch(() => undefined);
              return response;
            } finally {
              if (this.isServer) setTimeout(done, SERVER_SETTLE_MS);
              else done();
            }
          },
        },
      },
    );

    return this.client;
  }

  /**
   * Decide si un servicio debe responder con mocks.
   *
   * Devuelve true si se pidió explícitamente (`useMockData`) o si sencillamente
   * no hay backend configurado.
   */
  shouldUseMockData(): boolean {
    return environment.useMockData || !this.isConfigured;
  }
}
