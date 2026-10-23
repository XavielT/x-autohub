/**
 * Cómo se mapean las 17 categorías de texto de la tienda anterior a las del
 * árbol nuevo. Es el mismo mapeo que hace la migración 0017 sobre las filas que
 * ya existen; si cambia uno, cambia el otro.
 */
export const LEGACY_CATEGORY_TO_SLUG: Readonly<Record<string, string>> = {
  interior: 'accesorios-interior',
  exterior: 'accesorios-exterior',
  luces: 'iluminacion',
  audio: 'audio-multimedia',
  llantas: 'llantas-aros',
  frenos: 'frenos',
  suspension: 'suspension',
  motor: 'motor-filtros',
  filtros: 'motor-filtros',
  aceites: 'motor-filtros',
  escape: 'motor-filtros',
  transmision: 'motor-filtros',
  // Radiador, intercooler, termostato: enfriar el motor, no aire acondicionado.
  refrigeracion: 'motor-filtros',
  electrico: 'electrico-baterias',
  bateria: 'electrico-baterias',
  detailing: 'limpieza-detailing',
  herramientas: 'herramientas-emergencia',
};
