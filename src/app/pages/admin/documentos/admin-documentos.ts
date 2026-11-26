import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DOCUMENT, DecimalPipe, DatePipe } from '@angular/common';
import { Skeleton } from '../../../../shared/ui/skeleton/skeleton';
import { Icon } from '../../../../shared/ui/icon/icon';
import { DocumentSheet } from '../../../../shared/ui/document-sheet/document-sheet';
import { BusinessDocumentService } from '../../../../shared/services/business-document.service';
import { SiteSettingsService } from '../../../../shared/services/site-settings.service';
import { ProductService } from '../../../../shared/services/product.service';
import { AdminServicesService } from '../../../../shared/services/admin-services.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { BankAccount } from '../../../../shared/models/order.model';
import {
  BusinessDocument,
  BusinessProfile,
  DocumentDraft,
  DocumentKind,
  DocumentLine,
  DocumentStatus,
  DocumentVehicle,
  EMPTY_BUSINESS_PROFILE,
  KIND_LABELS,
  LINE_KIND_LABELS,
  LineKind,
  STATUSES_BY_KIND,
  STATUS_LABELS,
  TemplateId,
} from '../../../../shared/models/business-document.model';
import { DOCUMENT_TEMPLATES, blankLine, draftFromTemplate, templateById } from '../../../../shared/utils/document-templates';
import { computeTotals } from '../../../../shared/utils/document-totals';
import {
  SECTION_PRESETS,
  mergeTitles,
  moveItem,
  moveLine,
  renameSection,
  sortBySection,
  uniqueTitle,
} from '../../../../shared/utils/document-sections';
import { documentWhatsAppLink } from '../../../../shared/utils/document-whatsapp';

type View = 'list' | 'pick' | 'edit';
type Filter = 'all' | DocumentKind;
type TextKey = 'customerName' | 'customerPhone' | 'customerEmail' | 'customerRnc' | 'issueDate' | 'validUntil' | 'notes' | 'terms';
type NumberKey = 'discountValue' | 'itbisRate' | 'paid';
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
  const { id, kind, template, status, customerName, customerPhone, customerEmail, customerRnc, vehicle, issueDate, validUntil, items } = doc;
  return {
    id, kind, template, status, customerName, customerPhone, customerEmail, customerRnc,
    vehicle: { ...vehicle }, issueDate, validUntil, items: items.map((i) => ({ ...i })),
    discountType: doc.discountType, discountValue: doc.discountValue, applyItbis: doc.applyItbis, itbisRate: doc.itbisRate,
    paid: doc.paid, notes: doc.notes, terms: doc.terms, sourceId: doc.sourceId,
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
  imports: [Skeleton, DocumentSheet, Icon, DecimalPipe, DatePipe],
  templateUrl: './admin-documentos.html',
  styleUrl: './admin-documentos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDocumentos implements OnInit {
  private readonly docs = inject(BusinessDocumentService);
  private readonly settings = inject(SiteSettingsService);
  private readonly products = inject(ProductService);
  private readonly services = inject(AdminServicesService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);

  readonly templates = DOCUMENT_TEMPLATES;
  readonly kindLabels = KIND_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly lineKindLabels = LINE_KIND_LABELS;
  readonly lineKinds = Object.keys(LINE_KIND_LABELS) as LineKind[];

  readonly view = signal<View>('list');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly documents = signal<BusinessDocument[]>([]);
  readonly filter = signal<Filter>('all');

  readonly draft = signal<DocumentDraft | null>(null);
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
      return { title, lines, subtotal: lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) };
    });
  });

  readonly catalog = signal<CatalogEntry[] | null>(null);
  readonly catalogQuery = signal('');

  readonly visible = computed(() => {
    const f = this.filter();
    return this.documents().filter((d) => f === 'all' || d.kind === f);
  });

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
      { kind: d.kind, code: doc.code, customerName: d.customerName, customerPhone: d.customerPhone, total: t.total, validUntil: d.validUntil, balance: t.balance },
      this.profile().legalName,
    );
  });

  ngOnInit(): void {
    this.reload();
    this.settings.getBusinessProfile().subscribe({ next: (p) => this.profile.set(p), error: () => undefined });
    this.settings.getBankAccounts().subscribe({ next: (b) => this.banks.set(b), error: () => undefined });
  }

  private reload(): void {
    this.docs.list().subscribe({
      next: (list) => {
        this.documents.set(list);
        this.loading.set(false);
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
    this.docs.setStatus(doc, value(event) as DocumentStatus).subscribe({
      next: () => this.reload(),
      error: (error: Error) => this.toast.show(error.message, 'error'),
    });
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

  toInvoice(doc: BusinessDocument): void {
    const draft = this.docs.duplicate(doc, 'factura');
    this.edit({ ...draft, paid: 0 });
    this.saved.set(null);
    this.view.set('edit');
    this.toast.show('Factura lista como borrador. Revísala y guárdala.');
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
    this.saved.set(null);
    this.catalogQuery.set('');
    this.view.set('edit');
  }

  backToList(): void {
    this.view.set('list');
    this.draft.set(null);
    this.saved.set(null);
  }

  // --- Editor --------------------------------------------------------------

  private patch(partial: Partial<DocumentDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...partial } : d));
  }

  setText(key: TextKey, event: Event): void {
    const text = value(event);
    this.patch({ [key]: key === 'validUntil' ? text || null : text } as Partial<DocumentDraft>);
  }

  setNumber(key: NumberKey, event: Event): void {
    this.patch({ [key]: toNumber(value(event)) } as Partial<DocumentDraft>);
  }

  setVehicle(key: keyof DocumentVehicle, event: Event): void {
    this.draft.update((d) => (d ? { ...d, vehicle: { ...d.vehicle, [key]: value(event) } } : d));
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
    this.draft.update((d) => (d ? { ...d, items: moveLine(d.items, uid, delta) } : d));
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

  addLine(kind?: LineKind, description = '', unitPrice = 0): void {
    const d = this.draft();
    if (!d) return;
    let titles = this.sectionTitles();
    if (titles.length === 0) {
      titles = [''];
      this.sectionTitles.set(titles);
    }
    const section = this.target();
    const tpl = this.template();
    const line = blankLine(kind ?? tpl?.defaultLineKind ?? 'servicio', description, 1, unitPrice, section);
    // Una línea vacía al final de la sección se reutiliza en vez de dejar un renglón en blanco en medio.
    const own = d.items.filter((i) => i.section === section);
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

  setLineKind(uid: string, event: Event): void {
    const kind = value(event) as LineKind;
    this.draft.update((d) => (d ? { ...d, items: d.items.map((i) => (i.uid === uid ? { ...i, kind } : i)) } : d));
  }

  lineTotal(quantity: number, unitPrice: number): number {
    return quantity * unitPrice;
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

  save(): void {
    const d = this.draft();
    if (!d || this.saving()) return;
    this.saving.set(true);

    this.docs.save(d).subscribe({
      next: (doc) => {
        this.saving.set(false);
        this.saved.set(doc);
        // Con el id, el siguiente "Guardar" actualiza este mismo documento en vez de crear otro.
        this.draft.update((current) => (current ? { ...current, id: doc.id } : current));
        this.toast.show(`${doc.code} guardada.`);
        this.reload();
      },
      error: (error: Error) => {
        this.saving.set(false);
        this.toast.show(error.message, 'error');
      },
    });
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
