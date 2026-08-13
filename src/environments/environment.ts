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
  supabaseUrl: '',
  supabaseAnonKey: '',
};
