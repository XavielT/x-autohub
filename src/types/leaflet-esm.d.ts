/**
 * Tipos para la build ESM de Leaflet.
 *
 * El `package.json` de leaflet 1.9 solo declara `main` (`dist/leaflet-src.js`,
 * que es CommonJS) y no trae `module` ni `exports`. Importar `'leaflet'` a secas
 * hace que el bundler cargue el CJS y avise:
 *
 *   Module 'leaflet' ... is not ESM
 *   CommonJS or AMD dependencies can cause optimization bailouts.
 *
 * El paquete **sí** incluye `dist/leaflet-src.esm.js`, así que el import apunta
 * ahí. Se prefiere eso a añadir leaflet a `allowedCommonJsDependencies`, que solo
 * silenciaría el aviso dejando el bailout puesto.
 *
 * Esta declaración le da a esa ruta los mismos tipos que `@types/leaflet`, para
 * no tener que castear el resultado del import dinámico.
 */
declare module 'leaflet/dist/leaflet-src.esm.js' {
  export * from 'leaflet';
}
