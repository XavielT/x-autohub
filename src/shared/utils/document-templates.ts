import { DocumentDraft, DocumentKind, DocumentLine, LineKind, TemplateId } from '../models/business-document.model';
import { IconName } from '../ui/icon/icon';
import { DEFAULT_ITBIS_RATE, addDaysIso, todayIso } from './document-totals';

/** Un concepto que la plantilla ofrece con un toque. **Sin precio**: el precio lo pones tú, no se inventa. */
export interface LineSuggestion {
  kind: LineKind;
  description: string;
}

export interface DocumentTemplate {
  id: TemplateId;
  label: string;
  /** Nombre corto del área, para el selector de conceptos. */
  areaLabel: string;
  icon: IconName;
  description: string;
  /** Si el documento lleva el bloque del vehículo (marca, placa, kilometraje). */
  showVehicle: boolean;
  /** Si lleva chasis y dictamen (visto bueno / con observaciones / no recomendado): las revisiones de un vehículo. */
  hasInspection?: boolean;
  /** Secciones con las que arranca el documento (se renombran, mueven o borran). Vacío = una sola, sin título. */
  defaultSections: readonly string[];
  /** Tipo de línea con la que arranca "Agregar línea". */
  defaultLineKind: LineKind;
  /** Conceptos frecuentes de este tipo de trabajo, para agregar con un toque. */
  suggestions: readonly LineSuggestion[];
  /** Días de validez de una cotización. */
  validDays: number;
  /** Condiciones (garantía, tiempos, devoluciones) que salen al pie. Se pueden editar en cada documento. */
  terms: string;
  notes: string;
}

const WARRANTY_LABOR =
  'Garantía de 30 días sobre la mano de obra. Los repuestos tienen la garantía de su fabricante. ' +
  'Si al intervenir se encuentran daños adicionales, se le consulta antes de continuar.';

export const DOCUMENT_TEMPLATES: readonly DocumentTemplate[] = [
  {
    id: 'mecanica',
    icon: 'wrench',
    defaultSections: ['Mano de obra', 'Repuestos'],
    areaLabel: 'Mecánica',
    label: 'Reparación mecánica',
    description: 'Motor, frenos, suspensión, transmisión y dirección: mano de obra y repuestos por separado.',
    showVehicle: true,
    defaultLineKind: 'mano_de_obra',
    suggestions: [
      { kind: 'servicio', description: 'Diagnóstico mecánico' },
      { kind: 'mano_de_obra', description: 'Cambio de pastillas de freno' },
      { kind: 'mano_de_obra', description: 'Rectificado de discos de freno' },
      { kind: 'mano_de_obra', description: 'Cambio de amortiguadores' },
      { kind: 'mano_de_obra', description: 'Reparación de suspensión y dirección' },
      { kind: 'mano_de_obra', description: 'Cambio de correa de distribución' },
      { kind: 'mano_de_obra', description: 'Cambio de embrague' },
      { kind: 'servicio', description: 'Alineación y balanceo' },
    ],
    validDays: 15,
    terms: WARRANTY_LABOR,
    notes: '',
  },
  {
    id: 'electrica',
    icon: 'bolt',
    defaultSections: ['Diagnóstico', 'Mano de obra', 'Repuestos'],
    areaLabel: 'Eléctrica y A/C',
    label: 'Eléctrica y A/C',
    description: 'Diagnóstico con escáner, cableado, batería, alternador, luces y aire acondicionado.',
    showVehicle: true,
    defaultLineKind: 'mano_de_obra',
    suggestions: [
      { kind: 'servicio', description: 'Diagnóstico eléctrico con escáner' },
      { kind: 'mano_de_obra', description: 'Reparación de cableado' },
      { kind: 'mano_de_obra', description: 'Cambio de batería' },
      { kind: 'mano_de_obra', description: 'Reparación de alternador / arranque' },
      { kind: 'mano_de_obra', description: 'Revisión de luces y fusibles' },
      { kind: 'servicio', description: 'Recarga de gas del aire acondicionado' },
      { kind: 'servicio', description: 'Diagnóstico de fuga del aire acondicionado' },
    ],
    validDays: 15,
    terms: WARRANTY_LABOR,
    notes: '',
  },
  {
    id: 'mantenimiento',
    icon: 'droplet',
    defaultSections: ['Servicios', 'Repuestos'],
    areaLabel: 'Mantenimiento',
    label: 'Mantenimiento',
    description: 'Cambio de aceite, filtros, bujías y revisiones periódicas.',
    showVehicle: true,
    defaultLineKind: 'servicio',
    suggestions: [
      { kind: 'servicio', description: 'Cambio de aceite y filtro' },
      { kind: 'repuesto', description: 'Filtro de aire' },
      { kind: 'repuesto', description: 'Filtro de cabina' },
      { kind: 'mano_de_obra', description: 'Cambio de bujías' },
      { kind: 'servicio', description: 'Cambio de líquido de frenos' },
      { kind: 'servicio', description: 'Cambio de refrigerante' },
      { kind: 'servicio', description: 'Revisión general de 20 puntos' },
    ],
    validDays: 15,
    terms: 'Próximo mantenimiento según el kilometraje indicado por el fabricante. ' + WARRANTY_LABOR,
    notes: '',
  },
  {
    id: 'instalacion',
    icon: 'plug',
    defaultSections: ['Productos', 'Instalación'],
    areaLabel: 'Instalación',
    label: 'Instalación de accesorios',
    description: 'Luces LED, pantallas, cámaras, alarmas y otros accesorios con su instalación.',
    showVehicle: true,
    defaultLineKind: 'producto',
    suggestions: [
      { kind: 'mano_de_obra', description: 'Instalación de luces LED' },
      { kind: 'mano_de_obra', description: 'Instalación de pantalla / radio' },
      { kind: 'mano_de_obra', description: 'Instalación de cámara de reversa' },
      { kind: 'mano_de_obra', description: 'Instalación de alarma / arranque remoto' },
      { kind: 'mano_de_obra', description: 'Instalación de sensores de parqueo' },
    ],
    validDays: 15,
    terms:
      'Garantía de 30 días sobre la instalación. El accesorio tiene la garantía de su fabricante, ' +
      'que no cubre mal uso ni modificaciones posteriores.',
    notes: '',
  },
  {
    id: 'chequeo',
    icon: 'search',
    defaultSections: ['Chequeo'],
    areaLabel: 'Chequeo',
    label: 'Chequeo / Diagnóstico',
    description: 'Un chequeo cobrado aparte, sin reparación: revisión, escáner e informe de lo encontrado.',
    showVehicle: true,
    defaultLineKind: 'servicio',
    suggestions: [
      { kind: 'servicio', description: 'Chequeo general del vehículo' },
      { kind: 'servicio', description: 'Diagnóstico con escáner' },
      { kind: 'servicio', description: 'Revisión de frenos y suspensión' },
      { kind: 'servicio', description: 'Revisión de niveles y fluidos' },
      { kind: 'servicio', description: 'Revisión del sistema eléctrico y batería' },
      { kind: 'servicio', description: 'Revisión del aire acondicionado' },
      { kind: 'servicio', description: 'Informe del diagnóstico' },
    ],
    validDays: 7,
    terms:
      'El chequeo se cobra por separado de cualquier reparación. Se entrega el diagnóstico con lo encontrado; ' +
      'las reparaciones se cotizan aparte y solo se hacen con su aprobación.',
    notes: '',
  },
  {
    id: 'precompra',
    icon: 'shield-check',
    defaultSections: ['Revisión pre-compra'],
    areaLabel: 'Pre-compra',
    label: 'Revisión pre-compra',
    description: 'Revisamos un vehículo antes de que el cliente lo compre y le damos nuestro dictamen.',
    showVehicle: true,
    hasInspection: true,
    defaultLineKind: 'servicio',
    suggestions: [
      { kind: 'servicio', description: 'Revisión pre-compra completa' },
      { kind: 'servicio', description: 'Escaneo de códigos de falla' },
      { kind: 'servicio', description: 'Prueba de manejo' },
      { kind: 'servicio', description: 'Revisión de motor y transmisión' },
      { kind: 'servicio', description: 'Revisión de chasis, suspensión y frenos' },
      { kind: 'servicio', description: 'Revisión de carrocería y pintura' },
      { kind: 'servicio', description: 'Verificación de documentos y chasis' },
      { kind: 'servicio', description: 'Informe con fotos' },
    ],
    validDays: 7,
    terms:
      'Servicio de revisión previa a la compra. El dictamen refleja el estado del vehículo al momento de la inspección ' +
      'y no es una garantía de su funcionamiento futuro. Se da el visto bueno solo si el vehículo está en buen estado.',
    notes: '',
  },
  {
    id: 'venta',
    icon: 'bag',
    defaultSections: [],
    areaLabel: 'Piezas',
    label: 'Venta de piezas y accesorios',
    description: 'Solo productos, sin datos de vehículo. Ideal para mostrador o pedidos por WhatsApp.',
    showVehicle: false,
    defaultLineKind: 'producto',
    suggestions: [],
    validDays: 7,
    terms:
      'Cambios dentro de 7 días con empaque original y comprobante. ' +
      'Las piezas eléctricas ya instaladas no tienen devolución.',
    notes: '',
  },
  {
    id: 'general',
    icon: 'layers',
    defaultSections: ['Chequeo', 'Trabajos', 'Repuestos'],
    areaLabel: 'Otros',
    label: 'Mixta / general',
    description: 'Para una factura o cotización que junta varios trabajos: A/C, chequeo, piezas mecánicas y lo que haga falta.',
    showVehicle: true,
    defaultLineKind: 'servicio',
    suggestions: [
      { kind: 'servicio', description: 'Chequeo general del vehículo' },
      { kind: 'servicio', description: 'Diagnóstico y revisión' },
      { kind: 'mano_de_obra', description: 'Mano de obra' },
      { kind: 'repuesto', description: 'Repuestos' },
      { kind: 'otro', description: 'Traslado / grúa' },
    ],
    validDays: 15,
    terms: 'Precios sujetos a disponibilidad de piezas. Si el trabajo cambia al abrir el vehículo, se le avisa antes de proceder.',
    notes: '',
  },
];

export function templateById(id: TemplateId): DocumentTemplate {
  return DOCUMENT_TEMPLATES.find((t) => t.id === id) ?? DOCUMENT_TEMPLATES[DOCUMENT_TEMPLATES.length - 1];
}

let uidSeq = 0;
export const newLineUid = (): string => `l${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

export function blankLine(
  kind: LineKind,
  description = '',
  quantity = 1,
  unitPrice = 0,
  section = '',
  tbd = false,
): DocumentLine {
  return { uid: newLineUid(), section, kind, description, quantity, unitPrice: tbd ? 0 : unitPrice, tbd };
}

/** Un documento nuevo, ya con lo que trae la plantilla: condiciones, validez y una línea lista. */
export function draftFromTemplate(templateId: TemplateId, kind: DocumentKind, today: string = todayIso()): DocumentDraft {
  const tpl = templateById(templateId);
  return {
    id: null,
    kind,
    template: tpl.id,
    status: 'borrador',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerRnc: '',
    vehicle: { text: '', plate: '', mileage: '', vin: '', verdict: '' },
    issueDate: today,
    validUntil: kind === 'cotizacion' ? addDaysIso(today, tpl.validDays) : null,
    items: [blankLine(tpl.defaultLineKind, '', 1, 0, tpl.defaultSections[0] ?? '')],
    discountType: 'amount',
    discountValue: 0,
    applyItbis: false,
    itbisRate: DEFAULT_ITBIS_RATE,
    paid: 0,
    notes: tpl.notes,
    terms: tpl.terms,
    sourceId: null,
  };
}

/** Lo que falta para poder guardar, o `null` si está bien. */
export function validateDraft(draft: DocumentDraft): string | null {
  if (!draft.customerName.trim()) return 'Escribe el nombre del cliente.';
  const lines = draft.items.filter((i) => i.description.trim());
  if (lines.length === 0) return 'Agrega al menos una línea con descripción.';
  if (lines.some((i) => !(i.quantity > 0))) return 'La cantidad de cada línea debe ser mayor que cero.';
  if (lines.some((i) => i.unitPrice < 0)) return 'Un precio no puede ser negativo.';
  if (draft.discountType === 'percent' && (draft.discountValue < 0 || draft.discountValue > 100)) {
    return 'El descuento en porcentaje va de 0 a 100.';
  }
  if (draft.discountValue < 0) return 'El descuento no puede ser negativo.';
  if (draft.paid < 0) return 'Lo abonado no puede ser negativo.';
  return null;
}
