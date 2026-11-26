import { DiscountType } from '../utils/document-totals';

export type DocumentKind = 'cotizacion' | 'factura';

export type DocumentStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'emitida' | 'pagada' | 'anulada';

/** Qué es cada línea: sirve para agruparlas en el documento (mano de obra aparte de repuestos). */
export type LineKind = 'mano_de_obra' | 'repuesto' | 'servicio' | 'producto' | 'otro';

export type TemplateId =
  | 'mecanica'
  | 'electrica'
  | 'mantenimiento'
  | 'instalacion'
  | 'chequeo'
  | 'precompra'
  | 'venta'
  | 'general';

/** El resultado de una revisión pre-compra. Vacío = todavía sin dictamen. */
export type Verdict = '' | 'aprobado' | 'observaciones' | 'rechazado';

export const VERDICT_LABELS: Record<Exclude<Verdict, ''>, string> = {
  aprobado: 'Visto bueno: el vehículo está en buen estado',
  observaciones: 'Con observaciones: ver las notas',
  rechazado: 'No recomendado para la compra',
};

export const LINE_KIND_LABELS: Record<LineKind, string> = {
  mano_de_obra: 'Mano de obra',
  repuesto: 'Repuesto',
  servicio: 'Servicio',
  producto: 'Producto',
  otro: 'Otro',
};

export const KIND_LABELS: Record<DocumentKind, string> = { cotizacion: 'Cotización', factura: 'Factura' };

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  emitida: 'Emitida',
  pagada: 'Pagada',
  anulada: 'Anulada',
};

/** Los estados que tienen sentido para cada tipo de documento. */
export const STATUSES_BY_KIND: Record<DocumentKind, readonly DocumentStatus[]> = {
  cotizacion: ['borrador', 'enviada', 'aceptada', 'rechazada', 'anulada'],
  factura: ['borrador', 'emitida', 'pagada', 'anulada'],
};

export interface DocumentLine {
  /** Solo para el `track` de la lista en el formulario; no se guarda. */
  uid: string;
  /** Título de la sección a la que pertenece ('' = sin sección). Lo elige quien arma el documento. */
  section: string;
  kind: LineKind;
  description: string;
  quantity: number;
  unitPrice: number;
  /** "A determinar": todavía no se sabe qué es ni cuánto cuesta (una falla por descubrir). No suma al total. */
  tbd: boolean;
}

/** Un vehículo de un cliente, tal como se recuerda para sus próximos documentos. */
export interface CustomerVehicle {
  text: string;
  plate: string;
  mileage: string;
  vin: string;
}

export interface DocumentVehicle {
  /** "Volkswagen Jetta 2012". */
  text: string;
  plate: string;
  mileage: string;
  /** Chasis (VIN). Solo en las plantillas de revisión. */
  vin: string;
  /** Dictamen de la revisión pre-compra. */
  verdict: Verdict;
}

/** Un documento guardado. */
export interface BusinessDocument {
  id: string;
  kind: DocumentKind;
  number: number;
  /** `COT-0007`. */
  code: string;
  template: TemplateId;
  status: DocumentStatus;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  /** RNC o cédula del cliente, si lo da. */
  customerRnc: string;
  /** El cliente de la tabla al que pertenece (nulo si se borró). El documento guarda su propia copia de los datos. */
  customerId: string | null;
  vehicle: DocumentVehicle;
  /** `YYYY-MM-DD`. */
  issueDate: string;
  validUntil: string | null;
  items: DocumentLine[];
  discountType: DiscountType;
  discountValue: number;
  applyItbis: boolean;
  itbisRate: number;
  paid: number;
  notes: string;
  terms: string;
  sourceId: string | null;
  subtotal: number;
  itbis: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Un documento mientras se edita. `id` nulo = uno nuevo. */
export type DocumentDraft = Omit<
  BusinessDocument,
  'id' | 'number' | 'code' | 'subtotal' | 'itbis' | 'total' | 'createdAt' | 'updatedAt'
> & { id: string | null };

/** Los datos de quien emite (X AutoHub), que salen en el encabezado de cada documento. Ajuste `business_profile`. */
export interface BusinessProfile {
  legalName: string;
  rnc: string;
  phone: string;
  email: string;
  address: string;
  /** Línea final del documento: "Gracias por confiar en X AutoHub". */
  footer: string;
}

export const EMPTY_BUSINESS_PROFILE: BusinessProfile = {
  legalName: 'X AutoHub',
  rnc: '',
  phone: '',
  email: '',
  address: '',
  footer: 'Gracias por confiar en X AutoHub.',
};

/** Un cliente de X AutoHub (tabla `business_customers`, migración 0065). */
export interface BusinessCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** RNC o cédula. */
  rnc: string;
  address: string;
  notes: string;
  vehicles: CustomerVehicle[];
  createdAt: Date;
  updatedAt: Date;
}

/** Un cliente mientras se edita. `id` nulo = uno nuevo. */
export type CustomerDraft = Omit<BusinessCustomer, 'id' | 'createdAt' | 'updatedAt'> & { id: string | null };
