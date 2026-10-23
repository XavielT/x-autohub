import { ApplicationConfig, LOCALE_ID, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeEsDO from '@angular/common/locales/es-DO';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { httpErrorInterceptor } from '../core/http/http-error.interceptor';

// Sin esto los pipes `date` y `number` formatean en en-US aunque toda la
// interfaz esté en español.
registerLocaleData(localeEsDO);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'es-DO' },
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled',
      }),
    ),
    // Supabase usa fetch por dentro, así que no pasa por estos interceptores.
    // HttpClient queda disponible para llamadas ajenas a Supabase (por ejemplo
    // una pasarela de pago). Los errores de la base se traducen en
    // core/supabase/supabase-error.ts.
    provideHttpClient(withFetch(), withInterceptors([httpErrorInterceptor])),
    // Solo en producción: en desarrollo un service worker serviría archivos viejos.
    // Espera 30 s de estabilidad para no competir con la primera carga.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
