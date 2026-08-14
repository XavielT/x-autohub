import { AppEnvironment } from './app-environment';

/**
 * Configuración de desarrollo (valor por defecto del build).
 *
 * Para conectar tu proyecto de Supabase, pega la URL y la clave anon que salen
 * de: Dashboard → Project Settings → API. Mientras estén vacías, la app corre
 * con los mocks locales.
 *
 * Ver docs/BACKEND.md para el paso a paso completo.
 */
export const environment: AppEnvironment = {
  production: false,
  useMockData: false,
  supabaseUrl: 'https://bzhokbcvfkipqimifrrq.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6aG9rYmN2ZmtpcHFpbWlmcnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MzQxNTUsImV4cCI6MjEwMjIxMDE1NX0.7X7A0k1dbEku2rx6KcZ2NlEjDibyM6MEDYpvN5KZxG8',
};
