import { BusinessDocument, DocumentVehicle } from '../models/business-document.model';

/** Un cliente tal como se le recuerda: sus datos más recientes y los vehículos con los que ya vino. */
export interface CustomerRecord {
  /** El nombre normalizado, que es lo que identifica al cliente. */
  key: string;
  name: string;
  phone: string;
  email: string;
  rnc: string;
  /** Vehículos distintos que ya se le pusieron en documentos, el más reciente primero. */
  vehicles: DocumentVehicle[];
  /** Cuántos documentos tiene. */
  documents: number;
  lastAt: Date;
}

const digits = (s: string): string => s.replace(/\D/g, '');

/** Minúsculas, sin acentos y sin espacios de sobra: "  José  PÉREZ " y "jose perez" son el mismo cliente. */
export function customerKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const vehicleKey = (v: DocumentVehicle): string => (customerKey(v.plate) || customerKey(v.text)).replace(/\s/g, '');

/**
 * El directorio de clientes, sacado de los documentos que ya existen: no hay una tabla aparte, así que
 * lo que se escribió una vez en una factura queda disponible para la siguiente. Si un cliente aparece
 * en varios documentos, valen sus datos del más reciente; lo que falte ahí se completa con documentos
 * anteriores (el teléfono que se dio la primera vez, por ejemplo).
 */
export function customersFrom(docs: readonly BusinessDocument[]): CustomerRecord[] {
  const newestFirst = [...docs].sort((a, b) => +b.createdAt - +a.createdAt);
  const byKey = new Map<string, CustomerRecord>();

  for (const doc of newestFirst) {
    const key = customerKey(doc.customerName);
    if (!key) continue;

    const known = byKey.get(key);
    const vehicle = doc.vehicle;
    const hasVehicle = !!(vehicle.text.trim() || vehicle.plate.trim());

    if (!known) {
      byKey.set(key, {
        key,
        name: doc.customerName.trim(),
        phone: doc.customerPhone.trim(),
        email: doc.customerEmail.trim(),
        rnc: doc.customerRnc.trim(),
        vehicles: hasVehicle ? [{ ...vehicle }] : [],
        documents: 1,
        lastAt: doc.createdAt,
      });
      continue;
    }

    known.documents += 1;
    known.phone ||= doc.customerPhone.trim();
    known.email ||= doc.customerEmail.trim();
    known.rnc ||= doc.customerRnc.trim();
    if (hasVehicle && !known.vehicles.some((v) => vehicleKey(v) === vehicleKey(vehicle))) {
      known.vehicles.push({ ...vehicle });
    }
  }

  return [...byKey.values()].sort((a, b) => +b.lastAt - +a.lastAt);
}

/** Los clientes que coinciden con lo escrito (por nombre, teléfono o RNC), los más recientes primero. */
export function searchCustomers(customers: readonly CustomerRecord[], query: string, limit = 6): CustomerRecord[] {
  const q = customerKey(query);
  const qDigits = digits(query);
  if (!q) return [];

  return customers
    .filter((c) => c.key.includes(q) || (qDigits.length >= 3 && (digits(c.phone).includes(qDigits) || digits(c.rnc).includes(qDigits))))
    .slice(0, limit);
}
