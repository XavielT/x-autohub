/**
 * Cuánto dura un servicio, como se lee: `45 min`, `1 h`, `1 h 30 min`, `2 h`.
 * Es una estimación del taller, no una promesa: la cita ocupa solo su hora de inicio.
 */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
