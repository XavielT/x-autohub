import { CustomerVehicle } from '../models/business-document.model';

/** Lo mínimo que hace falta de un cliente para buscarlo o completarlo. */
export interface CustomerFields {
  name: string;
  phone: string;
  email: string;
  rnc: string;
  address?: string;
  vehicles: CustomerVehicle[];
}

/** Los datos de cliente y vehículo que trae un documento. */
export interface CustomerSource {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerRnc: string;
  vehicle: CustomerVehicle;
}

const digits = (s: string): string => s.replace(/\D/g, '');

/** Minúsculas, sin acentos y sin espacios de sobra: "  José  PÉREZ " y "jose perez" son el mismo nombre. */
export function customerKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Un vehículo se reconoce por su placa o, si no la tiene, por su nombre. */
export function vehicleKey(v: CustomerVehicle): string {
  return (customerKey(v.plate) || customerKey(v.text)).replace(/\s/g, '');
}

export const hasVehicleData = (v: CustomerVehicle): boolean => !!(v.text.trim() || v.plate.trim());

/**
 * Busca clientes por **nombre, RNC o cédula, teléfono o correo** (y, de paso, por placa).
 *
 * - Nombre, correo y placa: sin mayúsculas ni acentos, por cualquier parte ("perez" encuentra "José Pérez").
 * - Teléfono y RNC: por los dígitos, ignorando guiones y espacios ("5550134" encuentra "809-555-0134"). Hacen falta
 *   al menos 3 dígitos para no traer medio directorio con un "8".
 * - Varias palabras: tienen que estar todas ("jose 0134" encuentra a José por nombre y teléfono juntos).
 */
export function searchCustomers<T extends CustomerFields>(customers: readonly T[], query: string, limit = Infinity): T[] {
  const terms = customerKey(query).split(' ').filter(Boolean);
  if (terms.length === 0) return [];

  const matches = (c: T, term: string): boolean => {
    if (customerKey(c.name).includes(term)) return true;
    if (customerKey(c.email).includes(term)) return true;
    if (customerKey(c.address ?? '').includes(term)) return true;
    if (c.vehicles.some((v) => customerKey(v.plate).includes(term) || customerKey(v.text).includes(term))) return true;
    // Los dígitos solo se comparan si lo escrito es un número: "k123" es una placa, no un teléfono.
    if (!/^[\d().+-]+$/.test(term)) return false;
    const d = digits(term);
    return d.length >= 3 && (digits(c.phone).includes(d) || digits(c.rnc).includes(d));
  };

  return customers.filter((c) => terms.every((t) => matches(c, t))).slice(0, limit);
}

const clean = (v: CustomerVehicle): CustomerVehicle => ({
  text: v.text.trim(),
  plate: v.plate.trim(),
  mileage: v.mileage.trim(),
  vin: v.vin.trim(),
  ...(v.makeId != null ? { makeId: v.makeId, modelId: v.modelId ?? null, modelText: v.modelText ?? '', year: v.year ?? null } : {}),
});

/**
 * Lo que un documento le aporta a su cliente al guardarse: completa lo que el cliente no tenía (teléfono, correo,
 * RNC) y suma el vehículo si es nuevo. **Nunca pisa** un dato que el cliente ya tiene: para cambiarlo se edita el
 * cliente en `/admin/clientes`. Devuelve `null` si no hay nada que agregar.
 */
export function customerEnrichedBy<T extends CustomerFields>(customer: T, source: CustomerSource): T | null {
  const phone = customer.phone.trim() || source.customerPhone.trim();
  const email = customer.email.trim() || source.customerEmail.trim();
  const rnc = customer.rnc.trim() || source.customerRnc.trim();

  const vehicle = clean(source.vehicle);
  const addsVehicle = hasVehicleData(vehicle) && !customer.vehicles.some((v) => vehicleKey(v) === vehicleKey(vehicle));
  const vehicles = addsVehicle ? [vehicle, ...customer.vehicles] : customer.vehicles;

  const unchanged = phone === customer.phone && email === customer.email && rnc === customer.rnc && !addsVehicle;
  return unchanged ? null : { ...customer, phone, email, rnc, vehicles };
}

/** Un cliente nuevo a partir de lo escrito en un documento. */
export function customerFromSource(source: CustomerSource): Omit<CustomerFields, 'address'> & { address: string; notes: string } {
  const vehicle = clean(source.vehicle);
  return {
    name: source.customerName.trim(),
    phone: source.customerPhone.trim(),
    email: source.customerEmail.trim(),
    rnc: source.customerRnc.trim(),
    address: '',
    notes: '',
    vehicles: hasVehicleData(vehicle) ? [vehicle] : [],
  };
}
