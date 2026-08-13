import { AppEnvironment } from './app-environment';

/**
 * Configuración de producción. Se sustituye por `environment.ts` vía
 * `fileReplacements` en angular.json cuando se compila con
 * `--configuration production`.
 *
 * Pon aquí las credenciales del proyecto de producción. La clave anon es
 * pública (va en el bundle) y está protegida por RLS — pero la `service_role`
 * no debe aparecer nunca en este archivo.
 */
export const environment: AppEnvironment = {
  production: true,
  useMockData: false,
  supabaseUrl: '',
  supabaseAnonKey: '',
};
