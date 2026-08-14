import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { SupabaseService } from './core/supabase/supabase.service';
import { TestSupabaseService } from './core/supabase/supabase.service.testing';

/**
 * Providers globales del entorno de pruebas (`providersFile` en angular.json).
 *
 * Sin esto, cada spec generado por el CLI falla con NG0201: los componentes de
 * este proyecto usan RouterLink, ActivatedRoute o HttpClient, y los specs
 * `should create` no declaran ningún provider. Configurarlo una vez aquí evita
 * repetirlo en los ~25 archivos de prueba.
 *
 * `provideHttpClientTesting` hace que ninguna prueba pegue a la red real por
 * `HttpClient`, y `TestSupabaseService` cierra el mismo hueco para Supabase,
 * que usa fetch y por eso los interceptores de Angular no lo ven.
 */
export default [
  provideZonelessChangeDetection(),
  provideRouter([]),
  provideLocationMocks(),
  provideHttpClient(),
  provideHttpClientTesting(),
  { provide: SupabaseService, useClass: TestSupabaseService },
];
