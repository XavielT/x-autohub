import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

/**
 * El arranque que usa el prerenderizado del build (`outputMode: "static"`): corre en Node, una vez
 * por ruta, y deja el HTML de cada página ya armado. No se usa en el navegador (ese es `main.ts`).
 */
const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;
