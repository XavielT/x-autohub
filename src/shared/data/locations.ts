/**
 * Las ubicaciones de República Dominicana: las 31 provincias más el Distrito
 * Nacional. Es la lista canónica y única — la usan `registro`, `publicar`, el
 * formulario de vehículos del panel y, más adelante, los filtros de búsqueda.
 *
 * **`name` es lo que se guarda.** Las columnas `location` de `hub_market_items`,
 * `auto_hub_vehicles` y `profiles` son `text`, así que no hizo falta migración:
 * estos valores son un subconjunto de lo que ya aceptaban.
 *
 * Los nombres van con sus acentos correctos, porque son nombres propios
 * (`docs/CONVENTIONS.md`). Que el usuario los escriba sin acento no importa: la
 * búsqueda del selector normaliza los dos lados antes de comparar, así que
 * "samana" encuentra "Samaná".
 *
 * ⚠️ Los datos que ya existían **no** salen todos de esta lista. El seed y lo
 * publicado a mano traen municipios y pueblos: "Bani", "Neiba", "Punta Cana",
 * "Santo Domingo Este", "Santo Domingo Norte". El selector los conserva en vez
 * de descartarlos — si los borrara al abrir un formulario de edición, guardar un
 * cambio de precio se llevaría la ubicación por delante. Ver `LocationSelect`.
 *
 * Los centroides son aproximados (dos decimales), suficientes para centrar un
 * marcador de provincia en el mapa; no son fronteras.
 */

export interface LocationOption {
  /** Valor canónico que se guarda. Ej.: 'Santo Domingo'. */
  name: string;
  /** Centroide aproximado, para el modo mapa. */
  lat: number;
  lng: number;
}

export const DO_LOCATIONS: readonly LocationOption[] = [
  { name: 'Azua', lat: 18.45, lng: -70.73 },
  { name: 'Bahoruco', lat: 18.48, lng: -71.42 },
  { name: 'Barahona', lat: 18.21, lng: -71.1 },
  { name: 'Dajabón', lat: 19.55, lng: -71.71 },
  { name: 'Distrito Nacional', lat: 18.48, lng: -69.93 },
  { name: 'Duarte', lat: 19.3, lng: -70.05 },
  { name: 'El Seibo', lat: 18.77, lng: -69.04 },
  { name: 'Elías Piña', lat: 18.88, lng: -71.7 },
  { name: 'Espaillat', lat: 19.63, lng: -70.42 },
  { name: 'Hato Mayor', lat: 18.76, lng: -69.26 },
  { name: 'Hermanas Mirabal', lat: 19.37, lng: -70.42 },
  { name: 'Independencia', lat: 18.5, lng: -71.85 },
  { name: 'La Altagracia', lat: 18.61, lng: -68.71 },
  { name: 'La Romana', lat: 18.43, lng: -68.97 },
  { name: 'La Vega', lat: 19.22, lng: -70.53 },
  { name: 'María Trinidad Sánchez', lat: 19.38, lng: -69.85 },
  { name: 'Monseñor Nouel', lat: 18.93, lng: -70.41 },
  { name: 'Monte Cristi', lat: 19.85, lng: -71.65 },
  { name: 'Monte Plata', lat: 18.81, lng: -69.78 },
  { name: 'Pedernales', lat: 18.02, lng: -71.75 },
  { name: 'Peravia', lat: 18.28, lng: -70.33 },
  { name: 'Puerto Plata', lat: 19.79, lng: -70.69 },
  { name: 'Samaná', lat: 19.21, lng: -69.34 },
  { name: 'San Cristóbal', lat: 18.42, lng: -70.11 },
  { name: 'San José de Ocoa', lat: 18.55, lng: -70.5 },
  { name: 'San Juan', lat: 18.81, lng: -71.23 },
  { name: 'San Pedro de Macorís', lat: 18.46, lng: -69.3 },
  { name: 'Sánchez Ramírez', lat: 19.05, lng: -70.15 },
  { name: 'Santiago', lat: 19.45, lng: -70.7 },
  { name: 'Santiago Rodríguez', lat: 19.47, lng: -71.34 },
  { name: 'Santo Domingo', lat: 18.5, lng: -69.85 },
  { name: 'Valverde', lat: 19.55, lng: -71.08 },
];

/**
 * Quita acentos y pasa a minúsculas, para comparar lo que el usuario escribe
 * contra el nombre guardado. `NFD` separa la letra de su tilde y el rango
 * `̀-ͯ` borra las tildes sueltas.
 */
export function normalizeLocation(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Las ubicaciones cuyo nombre contiene lo escrito, sin importar acentos. */
export function filterLocations(query: string): readonly LocationOption[] {
  const needle = normalizeLocation(query);
  if (!needle) return DO_LOCATIONS;
  return DO_LOCATIONS.filter((option) => normalizeLocation(option.name).includes(needle));
}

/**
 * La ubicación cuyo centroide está más cerca de un punto, por haversine.
 *
 * Es lo que convierte un clic libre en el mapa en un valor de la lista: el
 * usuario puede pinchar en el mar o en medio de una provincia y siempre sale un
 * nombre canónico. Se usa haversine y no distancia plana porque en el Caribe un
 * grado de longitud mide bastante menos que uno de latitud, y comparar los dos
 * como si fueran iguales desplaza el resultado hacia el este u oeste.
 */
export function nearestLocation(lat: number, lng: number): LocationOption {
  const R = 6371; // radio de la Tierra en km
  const rad = (deg: number) => (deg * Math.PI) / 180;

  let best = DO_LOCATIONS[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const option of DO_LOCATIONS) {
    const dLat = rad(option.lat - lat);
    const dLng = rad(option.lng - lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(lat)) * Math.cos(rad(option.lat)) * Math.sin(dLng / 2) ** 2;
    const distance = 2 * R * Math.asin(Math.sqrt(a));

    if (distance < bestDistance) {
      bestDistance = distance;
      best = option;
    }
  }

  return best;
}

/** true si el valor es uno de los nombres canónicos. */
export function isCanonicalLocation(value: string): boolean {
  return DO_LOCATIONS.some((option) => option.name === value);
}
