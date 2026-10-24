import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { SNAPSHOT_SETTLE_MS, holdPrerenderedPage } from './prerender-snapshot';

// La página prerenderizada se queda a la vista hasta que la app tiene sus datos (ver el archivo).
const release = holdPrerenderedPage(document);

bootstrapApplication(App, appConfig)
  .then((appRef) => appRef.whenStable())
  .then(() => setTimeout(release, SNAPSHOT_SETTLE_MS))
  .catch((err) => {
    release();
    console.error(err);
  });
