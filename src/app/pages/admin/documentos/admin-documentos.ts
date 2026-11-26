import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { switchMap } from 'rxjs';
import { DOCUMENT, DecimalPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { Skeleton } from '../../../../shared/ui/skeleton/skeleton';
import { Icon } from '../../../../shared/ui/icon/icon';
import { allVehicles, emptyDocumentVehicle, moveLineInSlot, vehicleLabel, vehicleSlot } from '../../../../shared/utils/document-vehicles';
import { VehiclePick } from '../../../../shared/components/vehicle-pick/vehicle-pick';
import { DocumentSheet } from '../../../../shared/ui/document-sheet/document-sheet';
import { BusinessDocumentService } from '../../../../shared/services/business-document.service';
import { SiteSettingsService } from '../../../../shared/services/site-settings.service';
import { ProductService } from '../../../../shared/services/product.service';
import { AdminServicesService } from '../../../../shared/services/admin-services.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { BankAccount } from '../../../../shared/models/order.model';
import {
  BusinessCustomer,
  BusinessDocument,
  BusinessProfile,
  CustomerVehicle,
  DocumentDraft,
  DocumentKind,
  DocumentLine,
  DocumentPayment,
  DocumentStatus,
  DocumentVehicle,
  EMPTY_BUSINESS_PROFILE,
  KIND_LABELS,
  LINE_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  LineKind,
  STATUSES_BY_KIND,
  STATUS_LABELS,
  TemplateId,
  VERDICT_LABELS,
  VehicleSelection,
  Verdict,
} from '../../../../shared/models/business-document.model';
import { DOCUMENT_TEMPLATES, blankLine, draftFromTemplate, templateById } from '../../../../shared/utils/document-templates';
import { computeTotals, round2, todayIso } from '../../../../shared/utils/document-totals';
import { defaultDueDate, overdueDays } from '../../../../shared/utils/document-overdue';
import {
  PAYMENT_METHODS,
  lastPaymentDate,
  newPaymentId,
  sortedPayments,
  statusForBalance,
  sumPayments,
  validatePayment,
} from '../../../../shared/utils/document-payments';
import {
  SECTION_PRESETS,
  mergeTitles,
  moveItem,
  moveLine,
  renameSection,
  sortBySection,
  uniqueTitle,
} from '../../../../shared/utils/document-sections';
import { documentWhatsAppLink, overdueReminderLink } from '../../../../shared/utils/document-whatsapp';
import { customerKey, searchCustomers } from '../../../../shared/utils/document-customers';
import { BusinessCustomerService } from '../../../../shared/services/business-customer.service';

type View = 'list' | 'pick' | 'edit';
type Filter = 'all' | DocumentKind | 'porFacturar' | 'vencidas';
type TextKey = 'customerName' | 'customerPhone' | 'customerEmail' | 'customerRnc' | 'issueDate' | 'validUntil' | 'notes' | 'terms';
type NumberKey = 'discountValue' | 'itbisRate';
type ProfileKey = keyof BusinessProfile;

interface CatalogEntry {
  label: string;
  price: number;
  kind: LineKind;
}

const value = (event: Event): string => (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
const toNumber = (raw: string): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

/** De un documento guardado al borrador que se edita. */
function toDraft(doc: BusinessDocument): DocumentDraft {
  const { id, kind, template, status, customerName, customerPhone, customerEmail, customerRnc, customerId, vehicle, issueDate, validUntil, items } = doc;
  return {
    id, kind, template, status, customerName, customerPhone, customerEmail, customerRnc, customerId,
    vehicle: { ...vehicle }, extraVehicles: (doc.extraVehicles ?? []).map((v) => ({ ...v })), issueDate, validUntil, items: items.map((i) => ({ ...i })),
    discountType: doc.discountType, discountValue: doc.discountValue, applyItbis: doc.applyItbis, itbisRate: doc.itbisRate,
    paid: doc.paid, payments: (doc.payments ?? []).map((p) => ({ ...p })), notes: doc.notes, terms: doc.terms, sourceId: doc.sourceId,
  };
}

/**
 * Cotizaciones y facturas (`/admin/documentos`).
 *
 * El flujo es: elegir plantilla (según el tipo de trabajo) → llenar cliente, vehículo y líneas →
 * guardar → imprimir / PDF o mandar por WhatsApp. Cada plantilla trae sus conceptos frecuentes,
 * condiciones y vigencia ya escritos; los **precios nunca se inventan**: salen de lo que escribes o
 * del catálogo (piezas de la tienda y servicios del taller).
 *
 * El consecutivo y los totales los pone Postgres al guardar; aquí se calculan solo para mostrar.
 */
@Component({
  selector: 'app-admin-documentos',
  imports: [Skeleton, DocumentSheet, Icon, VehiclePick, DecimalPipe, DatePipe, NgTemplateOutlet],
  templateUrl: './admin-documentos.html',
  styleUrl: './admin-documentos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDocumentos implements OnInit {
  private readonly docs = inject(BusinessDocumentService);
  private readonly customerService = inject(BusinessCustomerService);
  private readonly route = inject(ActivatedRoute);
  private readonly settings = inject(SiteSettingsService);
  private readonly products = inject(ProductService);
  private readonly services = inject(AdminServicesService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly templates = DOCUMENT_TEMPLATES;
  readonly kindLabels = KIND_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly verdictLabels = VERDICT_LABELS;
  readonly paymentMethods = PAYMENT_METHODS;
  readonly paymentMethodLabels = PAYMENT_METHOD_LABELS;
  readonly lineKindLabels = LINE_KIND_LABELS;
  readonly lineKinds = Object.keys(LINE_KIND_LABELS) as LineKind[];

  readonly view = signal<View>('list');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly documents = signal<BusinessDocument[]>([]);
  readonly filter = signal<Filter>('all');

  readonly draft = signal<DocumentDraft | null>(null);
  // --- Cobros: el formulario de un abono ---
  readonly payDate = signal(todayIso());
  readonly payAmount = signal('');
  readonly payMethod = signal<PaymentMethod>('transferencia');
  readonly payNote = signal('');
  /** El abono que pidió quitarse y espera la segunda pulsación. */
  readonly pendingPaymentRemove = signal<string | null>(null);

  /** Solo se cobra una factura ya emitida: ni un borrador (todavía no se entrega) ni una anulada. */
  readonly canPay = computed(() => {
    const d = this.draft();
    return !!d && d.kind === 'factura' && d.status !== 'borrador' && d.status !== 'anulada';
  });

  readonly paymentsList = computed(() => sortedPayments(this.draft()?.payments ?? []));

  /** El día en que se terminó de pagar (el del último abono), solo si el saldo es cero. */
  readonly paidOn = computed(() => {
    const d = this.draft();
    const t = this.totals();
    return d && t && d.payments.length > 0 && t.balance <= 0 && t.total > 0 ? lastPaymentDate(d.payments) : null;
  });

  /** Lo que falta por cobrar de todas las facturas emitidas (las cuentas por cobrar). */
  readonly receivable = computed(() => {
    const open = this.documents().filter((d) => d.kind === 'factura' && d.status === 'emitida' && d.total - d.paid > 0.004);
    return { total: round2(open.reduce((sum, d) => sum + (d.total - d.paid), 0)), count: open.length };
  });

  /** La cotización aceptada que todavía no tiene factura: el sistema sugiere crearla. */
  readonly suggestInvoice = signal<BusinessDocument | null>(null);

  /** La factura (no anulada) que salió de cada cotización, por id de la cotización. */
  private readonly invoiceByQuote = computed(() => {
    const map = new Map<string, BusinessDocument>();
    for (const d of this.documents()) {
      if (d.kind === 'factura' && d.sourceId && d.status !== 'anulada') map.set(d.sourceId, d);
    }
    return map;
  });

  /** La factura de la cotización que se está editando (si ya la tiene): su estado se ve como Facturada. */
  readonly invoiceOfEditing = computed(() => {
    const doc = this.saved();
    const d = this.draft();
    return doc && d?.kind === 'cotizacion' ? this.invoiceOf(doc) : null;
  });

  /** La cotización de la que viene la factura que se está editando. */
  readonly sourceQuote = computed(() => {
    const d = this.draft();
    return d?.kind === 'factura' && d.sourceId ? (this.documents().find((x) => x.id === d.sourceId) ?? null) : null;
  });
  /** El documento tal como quedó guardado: de ahí salen el código y el enlace de WhatsApp. */
  readonly saved = signal<BusinessDocument | null>(null);
  /** El tipo que se elige en el paso de plantillas. */
  readonly pickKind = signal<DocumentKind>('cotizacion');

  readonly profile = signal<BusinessProfile>({ ...EMPTY_BUSINESS_PROFILE });
  readonly banks = signal<BankAccount[]>([]);
  readonly profileOpen = signal(false);
  readonly profileSaving = signal(false);

  /** Áreas con conceptos frecuentes: están en todos los documentos, porque una factura puede mezclar trabajos. */
  readonly suggestionAreas = DOCUMENT_TEMPLATES.filter((t) => t.suggestions.length > 0).map((t) => ({
    id: t.id,
    icon: t.icon,
    label: t.areaLabel,
    suggestions: t.suggestions,
  }));
  private readonly suggestAreaId = signal<TemplateId | null>(null);

  /** El área abierta: la que el usuario tocó o, por defecto, la de la plantilla del documento. */
  readonly activeArea = computed(() => {
    const wanted = this.suggestAreaId() ?? this.draft()?.template ?? null;
    return this.suggestionAreas.find((a) => a.id === wanted) ?? this.suggestionAreas[0];
  });

  /** Los títulos de las secciones, en su orden: viven en el editor y dejan tener secciones todavía vacías. */
  readonly sectionTitles = signal<string[]>([]);
  private readonly targetTitle = signal<string | null>(null);
  /** La sección que pidió quitarse y espera la segunda pulsación. */
  readonly pendingRemove = signal<string | null>(null);
  readonly sectionPresets = SECTION_PRESETS;

  /** A qué sección van los conceptos que se tocan: la elegida o, por defecto, la primera. */
  readonly target = computed(() => {
    const titles = this.sectionTitles();
    const wanted = this.targetTitle();
    return wanted !== null && titles.includes(wanted) ? wanted : (titles[0] ?? '');
  });

  /** Las secciones con sus líneas y su subtotal, para dibujar el editor. */
  readonly grouped = computed(() => {
    const d = this.draft();
    if (!d) return [];
    return this.sectionTitles().map((title) => {
      const lines = d.items.filter((i) => i.section === title);
      return {
        title,
        lines,
        subtotal: lines.reduce((sum, l) => sum + (l.tbd ? 0 : l.quantity * l.unitPrice), 0),
        pending: lines.filter((l) => l.tbd).length,
      };
    });
  });

  /** Los clientes de siempre, sacados de los documentos ya guardados. */
  readonly customers = signal<BusinessCustomer[]>([]);
  /** Cliente con el que se abrió la página (desde /admin/clientes): se aplica al elegir la plantilla. */
  private readonly prefillCustomerId = signal<string | null>(null);
  /** Cambia cuando el vehículo se pone desde fuera (otro documento, un cliente): el selector vuelve a arrancar con él. */
  readonly vehicleKey = signal(0);
  readonly customerFocus = signal(false);
  /** El cliente que se eligió de la lista: de él salen los vehículos que se ofrecen. */
  readonly pickedCustomer = signal<BusinessCustomer | null>(null);

  /** Clientes anteriores que coinciden con lo que se escribe en el nombre (mientras el campo está en foco). */
  readonly customerMatches = computed(() => {
    const d = this.draft();
    if (!this.customerFocus() || !d) return [];
    const picked = this.pickedCustomer()?.id;
    return searchCustomers(this.customers(), d.customerName, 6).filter((c) => c.id !== picked);
  });

  readonly catalog = signal<CatalogEntry[] | null>(null);
  readonly catalogQuery = signal('');

  /** Solo los documentos de este cliente (se llega con `?filtrar=<id>` desde /admin/clientes). */
  readonly customerFilter = signal<string | null>(null);
  /** Un documento que pidió abrirse por enlace (`?abrir=<id>`): se abre en cuanto llega la lista. */
  private readonly pendingOpenId = signal<string | null>(null);

  /** El nombre del cliente del filtro, para decirlo en pantalla. */
  readonly filterCustomerName = computed(() => {
    const id = this.customerFilter();
    if (!id) return '';
    return this.customers().find((c) => c.id === id)?.name ?? this.documents().find((d) => d.customerId === id)?.customerName ?? '';
  });

  readonly visible = computed(() => {
    const f = this.filter();
    const customer = this.customerFilter();
    return this.documents().filter((d) => {
      if (customer && d.customerId !== customer) return false;
      if (f === 'all') return true;
      if (f === 'porFacturar') return this.isToInvoice(d);
      if (f === 'vencidas') return this.daysLate(d) > 0;
      return d.kind === f;
    });
  });

  /** Las facturas con saldo cuya fecha de vencimiento ya pasó, y cuánto suman. */
  readonly overdue = computed(() => {
    const late = this.documents().filter((d) => this.daysLate(d) > 0);
    return { count: late.length, total: round2(late.reduce((sum, d) => sum + (d.total - d.paid), 0)) };
  });

  /** Días de atraso de una factura (0 si no está vencida). */
  daysLate(doc: BusinessDocument): number {
    return overdueDays(doc, todayIso());
  }

  /** Enlace de WhatsApp con el recordatorio de cobro, o vacío si la factura no tiene teléfono. */
  reminderLink(doc: BusinessDocument): string {
    return overdueReminderLink(
      { kind: doc.kind, code: doc.code, customerName: doc.customerName, customerPhone: doc.customerPhone, total: doc.total, validUntil: doc.validUntil, balance: round2(doc.total - doc.paid) },
      this.profile().legalName,
      this.daysLate(doc),
    );
  }

  /** Cuántas cotizaciones aceptadas esperan su factura (el número del filtro "Por facturar"). */
  readonly toInvoiceCount = computed(() => this.documents().filter((d) => this.isToInvoice(d)).length);

  readonly template = computed(() => {
    const d = this.draft();
    return d ? templateById(d.template) : null;
  });

  readonly statuses = computed<readonly DocumentStatus[]>(() => {
    const d = this.draft();
    return d ? STATUSES_BY_KIND[d.kind] : [];
  });

  readonly totals = computed(() => {
    const d = this.draft();
    return d ? computeTotals({ ...d, items: d.items.filter((i) => i.description.trim()) }) : null;
  });

  readonly catalogResults = computed(() => {
    const q = this.catalogQuery().trim().toLowerCase();
    const all = this.catalog();
    if (!q || !all) return [];
    return all.filter((e) => e.label.toLowerCase().includes(q)).slice(0, 8);
  });

  readonly whatsappLink = computed(() => {
    const doc = this.saved();
    const d = this.draft();
    if (!doc || !d) return '';
    const t = computeTotals({ ...d, items: d.items.filter((i) => i.description.trim()) });
    return documentWhatsAppLink(
      { kind: d.kind, code: doc.code, customerName: d.customerName, customerPhone: d.customerPhone, total: t.total, validUntil: d.validUntil, balance: t.balance, pending: t.pending },
      this.profile().legalName,
    );
  });

  ngOnInit(): void {
    // Primero lo que pide el enlace y después cargar los datos: si la lista llegara al instante, `abrir` ya tiene que estar anotado.
    const params = this.route.snapshot.queryParamMap;
    const wanted = params.get('cliente');
    if (wanted) {
      this.prefillCustomerId.set(wanted);
      this.view.set('pick');
    }
    this.customerFilter.set(params.get('filtrar'));
    this.pendingOpenId.set(params.get('abrir'));
    this.reload();
    this.reloadCustomers();
    this.settings.getBusinessProfile().subscribe({ next: (p) => this.profile.set(p), error: () => undefined });
    this.settings.getBankAccounts().subscribe({ next: (b) => this.banks.set(b), error: () => undefined });
  }

  /** Abre el documento que se pidió por enlace, una sola vez; si ya no existe, lo dice. */
  private openPending(list: BusinessDocument[]): void {
    const id = this.pendingOpenId();
    if (!id) return;
    this.pendingOpenId.set(null);
    const doc = list.find((d) => d.id === id);
    if (doc) this.open(doc);
    else this.toast.show('No encontramos ese documento. Puede que se haya borrado.', 'error');
  }

  clearCustomerFilter(): void {
    this.customerFilter.set(null);
  }

  private reloadCustomers(): void {
    this.customerService.list().subscribe({ next: (list) => this.customers.set(list), error: () => undefined });
  }

  private reload(): void {
    this.docs.list().subscribe({
      next: (list) => {
        this.documents.set(list);
        this.loading.set(false);
        this.openPending(list);
      },
      error: (error: Error) => {
        this.loading.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  // --- Lista ---------------------------------------------------------------

  setFilter(f: Filter): void {
    this.filter.set(f);
  }

  statusesFor(kind: DocumentKind): readonly DocumentStatus[] {
    return STATUSES_BY_KIND[kind];
  }

  changeStatus(doc: BusinessDocument, event: Event): void {
    const status = value(event) as DocumentStatus;
    this.docs.setStatus(doc, status).subscribe({
      next: () => {
        this.reload();
        // Una cotización aceptada es el momento de facturar: se sugiere (si no tiene ya su factura).
        if (status === 'aceptada' && doc.kind === 'cotizacion' && !this.invoiceOf(doc)) {
          this.suggestInvoice.set({ ...doc, status });
        }
      },
      error: (error: Error) => this.toast.show(error.message, 'error'),
    });
  }

  /**
   * "Facturada" es el estado de una cotización que ya tiene su factura. No se guarda aparte: se deduce del enlace
   * (la factura con `sourceId` apuntando a ella y sin anular). Así, si esa factura se anula o se borra, la cotización
   * vuelve sola a su estado anterior y nunca queda un "Facturada" que ya no es cierto.
   */
  isInvoiced(doc: BusinessDocument): boolean {
    return doc.kind === 'cotizacion' && this.invoiceOf(doc) !== null;
  }

  /** Una cotización aceptada que todavía no tiene factura: lo que hay que facturar. */
  isToInvoice(doc: BusinessDocument): boolean {
    return doc.kind === 'cotizacion' && doc.status === 'aceptada' && this.invoiceOf(doc) === null;
  }

  /** La factura que salió de esta cotización, si ya existe. */
  invoiceOf(quote: BusinessDocument): BusinessDocument | null {
    return this.invoiceByQuote().get(quote.id) ?? null;
  }

  /** La cotización de la que salió esta factura, si todavía existe. */
  quoteOf(invoice: BusinessDocument): BusinessDocument | null {
    return invoice.kind === 'factura' && invoice.sourceId ? (this.documents().find((d) => d.id === invoice.sourceId) ?? null) : null;
  }

  openInvoiceOf(quote: BusinessDocument): void {
    const invoice = this.invoiceOf(quote);
    if (invoice) this.open(invoice);
  }

  openQuoteOf(invoice: BusinessDocument): void {
    const quote = this.quoteOf(invoice);
    if (quote) this.open(quote);
  }

  /** Abre la cotización de la que viene la factura que se está editando. */
  openSourceQuote(): void {
    const quote = this.sourceQuote();
    if (quote) this.open(quote);
  }

  dismissSuggestion(): void {
    this.suggestInvoice.set(null);
  }

  open(doc: BusinessDocument): void {
    this.edit(toDraft(doc));
    this.saved.set(doc);
    this.view.set('edit');
  }

  duplicate(doc: BusinessDocument): void {
    this.edit(this.docs.duplicate(doc));
    this.saved.set(null);
    this.view.set('edit');
    this.toast.show('Copia lista como borrador. Revísala y guárdala.');
  }

  /** Crea la factura de una cotización: copia cliente, vehículo, secciones y líneas, y queda como borrador para revisarla. */
  toInvoice(doc: BusinessDocument): void {
    // Si ya tiene factura, se abre esa en vez de duplicarla por descuido (para otra, está "Duplicar").
    const existing = this.invoiceOf(doc);
    if (existing) {
      this.suggestInvoice.set(null);
      this.open(existing);
      this.toast.show(`${doc.code} ya tiene su factura: ${existing.code}.`);
      return;
    }

    const draft = this.docs.duplicate(doc, 'factura');
    this.edit({ ...draft, paid: 0, payments: [], validUntil: defaultDueDate(todayIso()) });
    this.saved.set(null);
    this.suggestInvoice.set(null);
    this.view.set('edit');
    const pending = doc.items.filter((i) => i.tbd).length;
    this.toast.show(
      pending > 0
        ? `Factura lista como borrador. Tiene ${pending} concepto(s) a determinar: ponles su precio para poder emitirla.`
        : 'Factura lista como borrador. Revísala y guárdala.',
    );
  }

  /** Crea la factura desde la cotización que se está viendo (la última versión guardada). */
  invoiceFromSaved(): void {
    const doc = this.saved();
    if (doc) this.toInvoice(doc);
  }

  remove(doc: BusinessDocument): void {
    this.docs.delete(doc).subscribe({
      next: () => {
        this.toast.show(`${doc.code} borrado.`);
        this.reload();
      },
      error: (error: Error) => this.toast.show(error.message, 'error'),
    });
  }

  // --- Nuevo ---------------------------------------------------------------

  startNew(): void {
    this.view.set('pick');
  }

  setPickKind(kind: DocumentKind): void {
    this.pickKind.set(kind);
  }

  pickTemplate(id: TemplateId): void {
    this.suggestAreaId.set(null);
    this.edit(draftFromTemplate(id, this.pickKind()), templateById(id).defaultSections);
    const wanted = this.customers().find((c) => c.id === this.prefillCustomerId());
    this.prefillCustomerId.set(null);
    if (wanted) this.useCustomer(wanted);
    this.saved.set(null);
    this.catalogQuery.set('');
    this.view.set('edit');
  }

  backToList(): void {
    this.view.set('list');
    this.suggestInvoice.set(null);
    this.draft.set(null);
    this.saved.set(null);
  }

  // --- Editor --------------------------------------------------------------

  private patch(partial: Partial<DocumentDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...partial } : d));
  }

  setText(key: TextKey, event: Event): void {
    const text = value(event);
    const picked = this.pickedCustomer();
    if (key === 'customerName' && picked && customerKey(text) !== customerKey(picked.name)) {
      this.pickedCustomer.set(null);
      this.patch({ customerId: null });
    }
    this.patch({ [key]: key === 'validUntil' ? text || null : text } as Partial<DocumentDraft>);
  }

  setNumber(key: NumberKey, event: Event): void {
    this.patch({ [key]: toNumber(value(event)) } as Partial<DocumentDraft>);
  }

  setVehicle(key: keyof DocumentVehicle, event: Event): void {
    this.draft.update((d) => (d ? { ...d, vehicle: { ...d.vehicle, [key]: value(event) } } : d));
  }

  onCustomerFocus(): void {
    this.customerFocus.set(true);
  }

  /** Se cierra con un respiro para que el toque sobre una sugerencia llegue antes que el cierre. */
  onCustomerBlur(): void {
    setTimeout(() => this.customerFocus.set(false), 150);
  }

  /** Rellena el documento con los datos guardados del cliente y, si la plantilla lleva vehículo y está vacío, el último que trajo. */
  useCustomer(customer: BusinessCustomer): void {
    const d = this.draft();
    if (!d) return;
    const emptyVehicle = !d.vehicle.text && !d.vehicle.plate && !d.vehicle.mileage && !d.vehicle.vin;
    const vehicle = this.template()?.showVehicle && emptyVehicle && customer.vehicles[0] ? this.vehicleOf(customer.vehicles[0], d.vehicle) : d.vehicle;

    this.pickedCustomer.set(customer);
    this.vehicleKey.update((k) => k + 1);
    this.customerFocus.set(false);
    this.patch({
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      customerRnc: customer.rnc,
      customerId: customer.id,
      vehicle,
    });
  }

  /** Pone en el documento uno de los vehículos que ya trajo el cliente (el dictamen no se arrastra). */
  useVehicle(vehicle: CustomerVehicle): void {
    this.vehicleKey.update((k) => k + 1);
    this.draft.update((d) => (d ? { ...d, vehicle: this.vehicleOf(vehicle, d.vehicle) } : d));
  }

  private vehicleOf(from: CustomerVehicle, current: DocumentVehicle): DocumentVehicle {
    return { ...from, text: from.text, plate: from.plate, mileage: from.mileage, vin: from.vin, verdict: current.verdict };
  }

  /** Lo que eligió el selector de marca, modelo y año. */
  pickVehicle(pick: VehicleSelection): void {
    this.draft.update((d) => (d ? { ...d, vehicle: { ...d.vehicle, ...pick } } : d));
  }

  // --- Más de un vehículo en el mismo documento ------------------------------------------------

  /** Los vehículos del documento (principal + extra) con su nombre, para el selector de cada línea. */
  readonly vehicleChoices = computed(() => {
    const d = this.draft();
    return d ? allVehicles(d).map((v, i) => ({ index: i, label: vehicleLabel(v, i) })) : [];
  });

  readonly hasExtraVehicles = computed(() => (this.draft()?.extraVehicles?.length ?? 0) > 0);

  /** Agrega otro vehículo en blanco (o uno de los del cliente) al documento. */
  addVehicle(from?: CustomerVehicle): void {
    this.vehicleKey.update((k) => k + 1);
    this.draft.update((d) => {
      if (!d) return d;
      const next = from ? this.vehicleOf(from, emptyDocumentVehicle()) : emptyDocumentVehicle();
      return { ...d, extraVehicles: [...(d.extraVehicles ?? []), next] };
    });
  }

  /** Quita un vehículo extra; sus líneas pasan a "general" y las de los siguientes se recorren un lugar. */
  removeVehicle(extraIndex: number): void {
    const d = this.draft();
    if (!d) return;
    const gone = extraIndex + 1;
    this.vehicleKey.update((k) => k + 1);
    this.draft.set({
      ...d,
      extraVehicles: (d.extraVehicles ?? []).filter((_, i) => i !== extraIndex),
      items: d.items.map((l) => {
        if (typeof l.vehicle !== 'number' || l.vehicle < gone) return l;
        const { vehicle, ...rest } = l;
        return vehicle === gone ? rest : { ...rest, vehicle: vehicle - 1 };
      }),
    });
  }

  pickExtraVehicle(extraIndex: number, pick: VehicleSelection): void {
    this.patchExtra(extraIndex, pick);
  }

  setExtraVehicle(extraIndex: number, key: 'plate' | 'mileage' | 'vin', event: Event): void {
    this.patchExtra(extraIndex, { [key]: value(event) });
  }

  private patchExtra(extraIndex: number, change: Partial<DocumentVehicle>): void {
    this.draft.update((d) =>
      d ? { ...d, extraVehicles: (d.extraVehicles ?? []).map((v, i) => (i === extraIndex ? { ...v, ...change } : v)) } : d,
    );
  }

  /** El vehículo al que van los conceptos que se tocan o se buscan (cuando hay más de uno). */
  readonly vehicleTarget = signal<number>(0);

  /** Con más de un vehículo el editor se divide por vehículo, cada uno con su color, líneas y subtotal. */
  readonly vehicleGroups = computed(() => {
    const d = this.draft();
    if (!d) return [];
    const list = allVehicles(d);
    const slots: (number | null)[] = [...list.map((_, i) => i), null];
    return slots
      .map((slot) => {
        const lines = d.items.filter((l) => vehicleSlot(l, list.length) === slot);
        return {
          slot,
          label: slot === null ? 'General (sin vehículo)' : vehicleLabel(list[slot], slot),
          color: slot === null ? 5 : slot % 5,
          lines,
          subtotal: lines.reduce((sum, l) => sum + (l.tbd ? 0 : l.quantity * l.unitPrice), 0),
          pending: lines.filter((l) => l.tbd).length,
        };
      })
      .filter((g) => g.slot !== null || g.lines.length > 0);
  });

  /** El vehículo donde caen los conceptos nuevos (si el elegido se quitó, el primero). */
  readonly activeVehicle = computed(() => {
    const count = this.vehicleChoices().length;
    return this.vehicleTarget() < count ? this.vehicleTarget() : 0;
  });

  setVehicleTarget(event: Event): void {
    this.vehicleTarget.set(Number(value(event)));
  }

  /** Agrega un concepto en blanco al vehículo de ese bloque. */
  addLineToVehicle(slot: number | null): void {
    if (slot !== null) this.vehicleTarget.set(slot);
    this.addLine(undefined, '', 0, false, slot);
  }

  /** La línea que acaba de moverse: se resalta un momento para que el ojo la siga. */
  readonly flashUid = signal<string | null>(null);
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  private followLine(uid: string): void {
    this.flashUid.set(uid);
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flashUid.set(null), 1600);
    setTimeout(() => {
      this.host.nativeElement.querySelector(`[data-uid="${uid}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, 30);
  }

  /** Al tocar un número se selecciona todo: lo que se escribe reemplaza el 0 en vez de quedar pegado a él. */
  selectAll(event: Event): void {
    (event.target as HTMLInputElement).select?.();
  }

  /** A qué vehículo va una línea ('' = general). */
  setLineVehicle(uid: string, event: Event): void {
    const d = this.draft();
    if (!d) return;
    const raw = value(event);
    this.commit(
      d.items.map((i) => {
        if (i.uid !== uid) return i;
        const { vehicle, ...rest } = i;
        return raw === '' ? rest : { ...rest, vehicle: Number(raw) };
      }),
      this.sectionTitles(),
    );
  }

  setVerdict(event: Event): void {
    const verdict = value(event) as Verdict;
    this.draft.update((d) => (d ? { ...d, vehicle: { ...d.vehicle, verdict } } : d));
  }

  setStatus(event: Event): void {
    this.patch({ status: value(event) as DocumentStatus });
  }

  setDiscountType(event: Event): void {
    this.patch({ discountType: value(event) === 'percent' ? 'percent' : 'amount' });
  }

  setItbis(event: Event): void {
    this.patch({ applyItbis: (event.target as HTMLInputElement).checked });
  }

  setSuggestArea(id: TemplateId): void {
    this.suggestAreaId.set(id);
  }

  /** Abre un documento en el editor: fija el borrador y las secciones (las dadas más las que traen las líneas). */
  private edit(draft: DocumentDraft, titles: readonly string[] = []): void {
    this.sectionTitles.set(mergeTitles(titles, draft.items));
    this.vehicleKey.update((k) => k + 1);
    this.pickedCustomer.set(null);
    this.targetTitle.set(null);
    this.pendingRemove.set(null);
    this.draft.set(draft);
  }

  /** Fija secciones y líneas a la vez, con las líneas siempre en el orden de las secciones. */
  private commit(items: DocumentLine[], titles: string[]): void {
    this.sectionTitles.set(titles);
    this.patch({ items: sortBySection(items, titles) });
  }

  setTarget(event: Event): void {
    this.targetTitle.set(value(event));
  }

  addSection(title = 'Nueva sección'): void {
    const d = this.draft();
    if (!d) return;
    const titles = this.sectionTitles();
    // Una sección que ya existe no se duplica: solo se elige como destino.
    const name = SECTION_PRESETS.includes(title) && titles.includes(title) ? title : uniqueTitle(title, titles);
    if (!titles.includes(name)) this.sectionTitles.set([...titles, name]);
    this.targetTitle.set(name);
  }

  renameSectionTo(title: string, event: Event): void {
    const d = this.draft();
    const next = value(event).trim();
    if (!d || next === title) return;
    const r = renameSection(d.items, this.sectionTitles(), title, next);
    if (this.targetTitle() === title) this.targetTitle.set(next);
    this.commit(r.items, r.titles);
  }

  /** Quita una sección. Si tiene líneas pide una segunda pulsación, porque se van con ella. */
  askRemoveSection(title: string): void {
    const d = this.draft();
    if (!d) return;
    const hasLines = d.items.some((i) => i.section === title);
    if (hasLines && this.pendingRemove() !== title) {
      this.pendingRemove.set(title);
      return;
    }
    this.pendingRemove.set(null);
    this.commit(
      d.items.filter((i) => i.section !== title),
      this.sectionTitles().filter((t) => t !== title),
    );
  }

  moveSectionBy(title: string, delta: -1 | 1): void {
    const d = this.draft();
    if (!d) return;
    const titles = this.sectionTitles();
    this.commit(d.items, moveItem(titles, titles.indexOf(title), delta));
  }

  moveLineBy(uid: string, delta: -1 | 1): void {
    this.draft.update((d) => {
      if (!d) return d;
      // Con varios vehículos solo se mueve entre las de su vehículo; si no, entre las de su sección.
      const items = (d.extraVehicles?.length ?? 0) > 0 ? moveLineInSlot(d.items, uid, delta, allVehicles(d).length) : moveLine(d.items, uid, delta);
      return { ...d, items };
    });
    this.followLine(uid);
  }

  setLineSection(uid: string, event: Event): void {
    const d = this.draft();
    if (!d) return;
    const section = value(event);
    this.commit(
      d.items.map((i) => (i.uid === uid ? { ...i, section } : i)),
      this.sectionTitles(),
    );
  }

  /** Agrega una línea en una sección concreta (el botón de cada sección). */
  addLineTo(title: string): void {
    this.targetTitle.set(title);
    this.addLine();
  }

  addLine(kind?: LineKind, description = '', unitPrice = 0, tbd = false, forSlot?: number | null): void {
    const d = this.draft();
    if (!d) return;
    const count = allVehicles(d).length;
    const multi = (d.extraVehicles?.length ?? 0) > 0;
    // Con varios vehículos, el concepto cae en el vehículo elegido (o en el del bloque donde se tocó).
    const slot: number | null = forSlot !== undefined ? forSlot : multi ? this.activeVehicle() : null;
    let titles = this.sectionTitles();
    if (titles.length === 0) {
      titles = [''];
      this.sectionTitles.set(titles);
    }
    const section = this.target();
    const tpl = this.template();
    const base = blankLine(kind ?? tpl?.defaultLineKind ?? 'servicio', description, 1, unitPrice, section, tbd);
    const line = multi && slot !== null && slot < count ? { ...base, vehicle: slot } : base;
    // Una línea vacía al final de la sección se reutiliza en vez de dejar un renglón en blanco en medio.
    const own = d.items.filter((i) => i.section === section && (!multi || vehicleSlot(i, count) === (slot !== null && slot < count ? slot : null)));
    const last = own[own.length - 1];
    const items =
      last && !last.description.trim() && last.unitPrice === 0
        ? d.items.map((i) => (i.uid === last.uid ? line : i))
        : [...d.items, line];
    this.commit(items, titles);
  }

  removeLine(uid: string): void {
    this.draft.update((d) => (d ? { ...d, items: d.items.filter((i) => i.uid !== uid) } : d));
  }

  setLineDescription(uid: string, event: Event): void {
    const text = value(event);
    this.draft.update((d) => (d ? { ...d, items: d.items.map((i) => (i.uid === uid ? { ...i, description: text } : i)) } : d));
  }

  setLineNumber(uid: string, key: 'quantity' | 'unitPrice', event: Event): void {
    const n = toNumber(value(event));
    this.draft.update((d) => (d ? { ...d, items: d.items.map((i) => (i.uid === uid ? { ...i, [key]: n } : i)) } : d));
  }

  /** Marca o desmarca una línea como "a determinar". Al marcarla su precio pasa a 0: no se sabe todavía. */
  setLineTbd(uid: string, event: Event): void {
    const tbd = (event.target as HTMLInputElement).checked;
    this.draft.update((d) =>
      d ? { ...d, items: d.items.map((i) => (i.uid === uid ? { ...i, tbd, unitPrice: tbd ? 0 : i.unitPrice } : i)) } : d,
    );
  }

  /** Una línea sin precio para algo que se sabrá cuando se revise: una reparación o una pieza "a determinar". */
  addTbdLine(kind: 'mano_de_obra' | 'repuesto'): void {
    this.addLine(kind, kind === 'repuesto' ? 'Pieza a determinar' : 'Reparación a determinar', 0, true);
  }

  setLineKind(uid: string, event: Event): void {
    const kind = value(event) as LineKind;
    this.draft.update((d) => (d ? { ...d, items: d.items.map((i) => (i.uid === uid ? { ...i, kind } : i)) } : d));
  }

  lineTotal(quantity: number, unitPrice: number): number {
    return quantity * unitPrice;
  }

  /** Si algún documento de la lista trae líneas "a determinar" (para avisarlo en su tarjeta). */
  hasTbd(doc: BusinessDocument): boolean {
    return doc.items.some((i) => i.tbd);
  }

  // --- Catálogo ------------------------------------------------------------

  /** Carga las piezas de la tienda y los servicios del taller la primera vez que se busca. */
  loadCatalog(): void {
    if (this.catalog() !== null) return;
    this.catalog.set([]);
    const entries: CatalogEntry[] = [];
    const publish = () => this.catalog.set([...entries]);

    this.products.getAll().subscribe({
      next: (list) => {
        entries.push(...list.map((p) => ({ label: p.name, price: p.price, kind: 'producto' as LineKind })));
        publish();
      },
      error: () => undefined,
    });
    this.services.getServices().subscribe({
      next: (list) => {
        entries.push(
          ...list.map((s) => ({ label: s.title, price: s.priceFrom ?? 0, kind: 'servicio' as LineKind })),
        );
        publish();
      },
      error: () => undefined,
    });
  }

  setCatalogQuery(event: Event): void {
    this.catalogQuery.set(value(event));
  }

  addFromCatalog(entry: CatalogEntry): void {
    this.addLine(entry.kind, entry.label, entry.price);
    this.catalogQuery.set('');
  }

  // --- Guardar, imprimir, enviar ------------------------------------------

  save(successMessage?: string): void {
    const d = this.draft();
    if (!d || this.saving()) return;
    this.saving.set(true);

    // El cliente se deja en la tabla primero (se crea o se completa) y el documento queda vinculado a él.
    this.customerService
      .resolveForDocument(d, this.customers())
      .pipe(switchMap((customerId) => this.docs.save({ ...d, customerId })))
      .subscribe({
      next: (doc) => {
        this.saving.set(false);
        this.saved.set(doc);
        // Con el id, el siguiente "Guardar" actualiza este mismo documento en vez de crear otro.
        this.draft.update((current) => (current ? { ...current, id: doc.id, customerId: doc.customerId } : current));
        this.reloadCustomers();
        this.toast.show(successMessage ?? `${doc.code} guardada.`);
        this.reload();
        if (doc.kind === 'cotizacion' && doc.status === 'aceptada' && !this.invoiceOf(doc)) this.suggestInvoice.set(doc);
      },
      error: (error: Error) => {
        this.saving.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  // --- Cobros -----------------------------------------------------------------

  setPayDate(event: Event): void {
    this.payDate.set(value(event));
  }

  setPayAmount(event: Event): void {
    this.payAmount.set(value(event));
  }

  setPayMethod(event: Event): void {
    this.payMethod.set(value(event) as PaymentMethod);
  }

  setPayNote(event: Event): void {
    this.payNote.set(value(event));
  }

  /** Pone en el monto todo lo que falta por cobrar. */
  payAll(): void {
    const t = this.totals();
    if (t && t.balance > 0) this.payAmount.set(String(t.balance));
  }

  /** Registra un abono. Si la factura ya está guardada, se guarda en el acto: un cobro no debería quedar a medias. */
  addPayment(): void {
    const d = this.draft();
    const t = this.totals();
    if (!d || !t || !this.canPay()) return;

    const amount = Number(this.payAmount().replace(',', '.'));
    const invalid = validatePayment({ date: this.payDate(), amount }, t.balance);
    if (invalid) {
      this.toast.show(invalid, 'error');
      return;
    }

    const payment = { id: newPaymentId(), date: this.payDate(), amount: round2(amount), method: this.payMethod(), note: this.payNote().trim() };
    this.payAmount.set('');
    this.payNote.set('');
    this.applyPayments([...d.payments, payment], 'Abono registrado.');
  }

  /** Quita un abono (se pide confirmar: cambia lo cobrado y puede devolver la factura a Emitida). */
  removePayment(id: string): void {
    const d = this.draft();
    if (!d) return;
    if (this.pendingPaymentRemove() !== id) {
      this.pendingPaymentRemove.set(id);
      return;
    }
    this.pendingPaymentRemove.set(null);
    this.applyPayments(d.payments.filter((p) => p.id !== id), 'Abono quitado.');
  }

  /**
   * Fija los abonos y deja lo demás coherente: `paid` es su suma y el estado sigue al saldo (al llegar a cero pasa a Pagada;
   * si vuelve a haber saldo, regresa a Emitida). Con la factura ya guardada, se guarda en el acto.
   */
  private applyPayments(payments: DocumentPayment[], message: string): void {
    const d = this.draft();
    if (!d) return;

    const paid = sumPayments(payments);
    const balance = computeTotals({ ...d, items: d.items.filter((i) => i.description.trim()), paid }).balance;
    const status = statusForBalance(d.status, balance);
    this.patch({ payments, paid, status });

    const note =
      status !== d.status
        ? status === 'pagada'
          ? ' La factura quedó saldada: pasó a Pagada.'
          : ' Volvió a haber saldo: la factura regresa a Emitida.'
        : '';
    if (this.saved()) this.save(message + note);
    else this.toast.show(message + note + ' Guarda la factura para que quede registrado.');
  }

  /** Lo que falta por cobrar de una factura de la lista. */
  owedOf(doc: BusinessDocument): number {
    return Math.max(0, round2(doc.total - doc.paid));
  }

  /** El día en que se terminó de pagar una factura de la lista. */
  paidOnOf(doc: BusinessDocument): string | null {
    return this.owedOf(doc) === 0 && doc.payments.length > 0 ? lastPaymentDate(doc.payments) : null;
  }

  /** Imprime solo la hoja. En el diálogo del navegador, "Guardar como PDF" genera el archivo con el nombre del documento. */
  print(): void {
    const d = this.draft();
    if (!d) return;
    const view = this.document.defaultView;
    if (!view) return;

    const body = this.document.body;
    const previousTitle = this.document.title;
    const code = this.saved()?.code ?? KIND_LABELS[d.kind];
    this.document.title = `${code} ${d.customerName}`.trim();
    body.classList.add('xah-print-doc');

    const restore = () => {
      body.classList.remove('xah-print-doc');
      this.document.title = previousTitle;
      view.removeEventListener('afterprint', restore);
    };
    view.addEventListener('afterprint', restore);
    view.print();
    // Algunos navegadores móviles no disparan `afterprint`: no se deja la página con la clase puesta.
    setTimeout(restore, 1500);
  }

  // --- Datos de la empresa -------------------------------------------------

  toggleProfile(): void {
    this.profileOpen.update((open) => !open);
  }

  setProfile(key: ProfileKey, event: Event): void {
    this.profile.update((p) => ({ ...p, [key]: value(event) }));
  }

  saveProfile(): void {
    if (this.profileSaving()) return;
    this.profileSaving.set(true);
    this.settings.setBusinessProfile(this.profile()).subscribe({
      next: () => {
        this.profileSaving.set(false);
        this.toast.show('Datos de la empresa guardados.');
      },
      error: (error: Error) => {
        this.profileSaving.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }
}
