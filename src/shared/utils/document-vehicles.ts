import { BusinessDocument, DocumentDraft, DocumentVehicle } from '../models/business-document.model';

/** Un vehículo en blanco, para agregar otro al documento. */
export const emptyDocumentVehicle = (): DocumentVehicle => ({ text: '', plate: '', mileage: '', vin: '', verdict: '' });

type WithVehicles = Pick<BusinessDocument | DocumentDraft, 'vehicle' | 'extraVehicles'>;

/** ¿Trae algún dato este vehículo? */
export const hasVehicleData = (v: DocumentVehicle): boolean => !!(v.text || v.plate || v.mileage || v.vin || v.verdict);

/** El vehículo principal y los demás, en orden: el índice de cada uno es el que guardan las líneas (`line.vehicle`). */
export const allVehicles = (doc: WithVehicles): DocumentVehicle[] => [doc.vehicle, ...(doc.extraVehicles ?? [])];

/** "Volkswagen Jetta 2012 · A123456", o "Vehículo 2" si todavía no tiene nombre. */
export function vehicleLabel(v: DocumentVehicle, index: number): string {
  const name = v.text.trim() || `Vehículo ${index + 1}`;
  return v.plate.trim() ? `${name} · ${v.plate.trim()}` : name;
}

/** Los extra que de verdad traen datos (los que quedaron en blanco no se guardan). */
export const cleanExtraVehicles = (list: readonly DocumentVehicle[] | undefined): DocumentVehicle[] =>
  (list ?? []).filter(hasVehicleData);

/** A qué vehículo va una línea (índice en `allVehicles`), o `null` si es general o apunta a uno que ya no existe. */
export const vehicleSlot = (line: { vehicle?: number }, count: number): number | null =>
  typeof line.vehicle === 'number' && line.vehicle >= 0 && line.vehicle < count ? line.vehicle : null;

/** Sube o baja una línea entre las de su mismo vehículo (las de los otros no se tocan ni se cruzan). */
export function moveLineInSlot<T extends { uid: string; vehicle?: number }>(items: readonly T[], uid: string, delta: -1 | 1, count: number): T[] {
  const at = items.findIndex((i) => i.uid === uid);
  if (at === -1) return [...items];
  const slot = vehicleSlot(items[at], count);
  for (let j = at + delta; j >= 0 && j < items.length; j += delta) {
    if (vehicleSlot(items[j], count) === slot) {
      const copy = [...items];
      [copy[at], copy[j]] = [copy[j], copy[at]];
      return copy;
    }
  }
  return [...items];
}
