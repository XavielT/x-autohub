import { version } from '../../package.json';

/**
 * La versión del sitio, tal como está en `package.json` en el momento del build (el ritual
 * de versión la sube en cada push a `main`). esbuild solo mete `version` en el bundle, no el
 * resto del archivo.
 */
export const APP_VERSION: string = version;
