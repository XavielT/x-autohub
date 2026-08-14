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
  supabaseUrl: 'https://bzhokbcvfkipqimifrrq.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6aG9rYmN2ZmtpcHFpbWlmcnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MzQxNTUsImV4cCI6MjEwMjIxMDE1NX0.7X7A0k1dbEku2rx6KcZ2NlEjDibyM6MEDYpvN5KZxG8',
};
