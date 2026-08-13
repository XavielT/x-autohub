import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Database } from './database.types';

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
