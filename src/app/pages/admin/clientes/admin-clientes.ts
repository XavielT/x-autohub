import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Skeleton } from '../../../../shared/ui/skeleton/skeleton';
import { Avatar } from '../../../../shared/ui/avatar/avatar';
import { Icon } from '../../../../shared/ui/icon/icon';
import { VehiclePick } from '../../../../shared/components/vehicle-pick/vehicle-pick';
import { BusinessCustomerService, validateCustomer } from '../../../../shared/services/business-customer.service';
import { BusinessDocumentService } from '../../../../shared/services/business-document.service';
import { ToastService } from '../../../../shared/services/toast.service';
import {
  BusinessCustomer,
  BusinessDocument,
  CustomerDraft,
  CustomerVehicle,
  KIND_LABELS,
  STATUS_LABELS,
  VehicleSelection,
} from '../../../../shared/models/business-document.model';
import { searchCustomers } from '../../../../shared/utils/document-customers';
import { round2 } from '../../../../shared/utils/document-totals';
import { buildWaLink } from '../../../../shared/utils/whatsapp';

type TextKey = 'name' | 'phone' | 'email' | 'rnc' | 'address' | 'notes';

const value = (event: Event): string => (event.target as HTMLInputElement | HTMLTextAreaElement).value;

let uidSeq = 0;
/** Un id estable por fila del formulario. La clave de `@for` tiene que depender solo del elemento, no de su posición. */
const newUid = (): string => `v${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

const blankVehicle = (): CustomerVehicle => ({ uid: newUid(), text: '', plate: '', mileage: '', vin: '' });

const blank = (): CustomerDraft => ({ id: null, name: '', phone: '', email: '', rnc: '', address: '', notes: '', vehicles: [] });

const toDraft = (c: BusinessCustomer): CustomerDraft => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  email: c.email,
  rnc: c.rnc,
  address: c.address,
  notes: c.notes,
  vehicles: c.vehicles.map((v) => ({ ...v, uid: newUid() })),
});

/**
 * Clientes (`/admin/clientes`): crear, editar y borrar, con su teléfono, correo, RNC o cédula, dirección, notas y los
 * vehículos con los que ya vinieron. Se buscan por nombre, RNC, teléfono o correo.
 *
 * Los documentos guardan su propia copia de los datos: cambiar o borrar a un cliente aquí no toca lo que ya se le
 * entregó. Los clientes nuevos también se agregan solos al guardar una cotización o factura.
 */
@Component({
  selector: 'app-admin-clientes',
  imports: [RouterLink, Skeleton, Avatar, Icon, VehiclePick, DatePipe, DecimalPipe],
  templateUrl: './admin-clientes.html',
  styleUrl: './admin-clientes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminClientes implements OnInit {
  private readonly customerService = inject(BusinessCustomerService);
  private readonly docService = inject(BusinessDocumentService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly customers = signal<BusinessCustomer[]>([]);
  readonly documents = signal<BusinessDocument[]>([]);
  readonly query = signal('');
  readonly draft = signal<CustomerDraft | null>(null);
  /** El cliente que pidió borrarse y espera la segunda pulsación. */
  readonly pendingDelete = signal<string | null>(null);

  /** Los que coinciden con lo buscado (todos, si no se escribió nada). */
  readonly shown = computed(() => {
    const q = this.query().trim();
    const found = q ? searchCustomers(this.customers(), q) : this.customers();
    if (!this.onlyOwing()) return found;
    // Con deuda: los que más deben primero, que es a quien hay que cobrar.
    return found
      .map((c) => ({ c, owed: this.statsOf(c).owed }))
      .filter((x) => x.owed > 0)
      .sort((a, b) => b.owed - a.owed)
      .map((x) => x.c);
  });

  /** Solo los clientes con facturas por cobrar. */
  readonly onlyOwing = signal(false);

  /** Cuántos clientes deben algo, y cuánto suman: el número que importa para cobrar. */
  readonly owing = computed(() => {
    let count = 0;
    let total = 0;
    for (const c of this.customers()) {
      const owed = this.statsOf(c).owed;
      if (owed > 0) {
        count++;
        total += owed;
      }
    }
    return { count, total: round2(total) };
  });

  toggleOwing(): void {
    this.onlyOwing.update((v) => !v);
  }

  /** Los documentos de cada cliente, del más reciente al más viejo. */
  private readonly docsByCustomer = computed(() => {
    const map = new Map<string, BusinessDocument[]>();
    for (const doc of [...this.documents()].sort((a, b) => +b.createdAt - +a.createdAt)) {
      if (!doc.customerId) continue;
      map.set(doc.customerId, [...(map.get(doc.customerId) ?? []), doc]);
    }
    return map;
  });

  /** Las cotizaciones que ya tienen factura (sin anular): su estado se ve como "Facturada". */
  private readonly invoicedQuotes = computed(
    () => new Set(this.documents().filter((d) => d.kind === 'factura' && d.sourceId && d.status !== 'anulada').map((d) => d.sourceId as string)),
  );

  /** Los clientes con la lista completa de documentos desplegada (por defecto se ven los 3 más recientes). */
  readonly allDocs = signal<ReadonlySet<string>>(new Set());
  readonly docsPreview = 3;

  /** El estado de un documento tal como se le muestra a quien administra: una cotización con factura es "Facturada". */
  statusLabelOf(doc: BusinessDocument): string {
    return doc.kind === 'cotizacion' && this.invoicedQuotes().has(doc.id) ? 'Facturada' : STATUS_LABELS[doc.status];
  }

  /** Para colorear la etiqueta del estado. */
  statusKeyOf(doc: BusinessDocument): string {
    return doc.kind === 'cotizacion' && this.invoicedQuotes().has(doc.id) ? 'facturada' : doc.status;
  }

  kindLabelOf(doc: BusinessDocument): string {
    return KIND_LABELS[doc.kind];
  }

  /** Lo que falta por cobrar de una factura emitida (0 en todo lo demás). */
  owedOf(doc: BusinessDocument): number {
    return doc.kind === 'factura' && doc.status === 'emitida' ? Math.max(0, round2(doc.total - doc.paid)) : 0;
  }

  /** Resumen de los documentos de un cliente: cuántos, cuánto se le ha facturado y cuánto debe. */
  statsOf(customer: BusinessCustomer): { count: number; quotes: number; invoices: number; billed: number; owed: number } {
    const docs = this.docsOf(customer);
    const invoices = docs.filter((d) => d.kind === 'factura');
    return {
      count: docs.length,
      quotes: docs.length - invoices.length,
      invoices: invoices.length,
      billed: round2(invoices.filter((d) => d.status === 'emitida' || d.status === 'pagada').reduce((sum, d) => sum + d.total, 0)),
      owed: round2(invoices.reduce((sum, d) => sum + this.owedOf(d), 0)),
    };
  }

  /** Los documentos que se ven de un cliente: los más recientes, o todos si desplegó la lista. */
  shownDocsOf(customer: BusinessCustomer): BusinessDocument[] {
    const docs = this.docsOf(customer);
    return this.allDocs().has(customer.id) ? docs : docs.slice(0, this.docsPreview);
  }

  toggleAllDocs(customer: BusinessCustomer): void {
    this.allDocs.update((set) => {
      const next = new Set(set);
      if (next.has(customer.id)) next.delete(customer.id);
      else next.add(customer.id);
      return next;
    });
  }

  ngOnInit(): void {
    this.reload();
    this.docService.list().subscribe({ next: (list) => this.documents.set(list), error: () => undefined });
  }

  private reload(): void {
    this.customerService.list().subscribe({
      next: (list) => {
        this.customers.set(list);
        this.loading.set(false);
      },
      error: (error: Error) => {
        this.loading.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  docsOf(customer: BusinessCustomer): BusinessDocument[] {
    return this.docsByCustomer().get(customer.id) ?? [];
  }

  whatsappLink(customer: BusinessCustomer): string {
    return buildWaLink(customer.phone, `Hola ${customer.name.trim().split(/\s+/)[0]}, te escribimos de X AutoHub.`);
  }

  // --- Búsqueda ------------------------------------------------------------

  setQuery(event: Event): void {
    this.query.set(value(event));
  }

  clearQuery(): void {
    this.query.set('');
    this.onlyOwing.set(false);
  }

  // --- Formulario ----------------------------------------------------------

  startNew(): void {
    this.pendingDelete.set(null);
    this.open(blank());
  }

  edit(customer: BusinessCustomer): void {
    this.pendingDelete.set(null);
    this.open(toDraft(customer));
  }

  private open(draft: CustomerDraft): void {
    this.draft.set(draft);
  }

  cancel(): void {
    this.draft.set(null);
  }

  setText(key: TextKey, event: Event): void {
    const text = value(event);
    this.draft.update((d) => (d ? { ...d, [key]: text } : d));
  }

  addVehicle(): void {
    this.draft.update((d) => (d ? { ...d, vehicles: [...d.vehicles, blankVehicle()] } : d));
  }

  removeVehicle(index: number): void {
    this.draft.update((d) => (d ? { ...d, vehicles: d.vehicles.filter((_, i) => i !== index) } : d));
  }

  /** Lo que eligió el selector de marca, modelo y año para ese vehículo. */
  setVehiclePick(index: number, pick: VehicleSelection): void {
    this.draft.update((d) =>
      d ? { ...d, vehicles: d.vehicles.map((v, i) => (i === index ? { ...v, ...pick } : v)) } : d,
    );
  }

  setVehicle(index: number, key: keyof CustomerVehicle, event: Event): void {
    const text = value(event);
    this.draft.update((d) =>
      d ? { ...d, vehicles: d.vehicles.map((v, i) => (i === index ? { ...v, [key]: text } : v)) } : d,
    );
  }

  save(): void {
    const d = this.draft();
    if (!d || this.saving()) return;

    const invalid = validateCustomer(d);
    if (invalid) {
      this.toast.show(invalid, 'error');
      return;
    }

    this.saving.set(true);
    this.customerService.save(d).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.draft.set(null);
        this.toast.show(`${saved.name} guardado.`);
        this.reload();
      },
      error: (error: Error) => {
        this.saving.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  // --- Borrar --------------------------------------------------------------

  /** Pide confirmar: sus documentos se quedan, pero el cliente se va. */
  askDelete(customer: BusinessCustomer): void {
    if (this.pendingDelete() !== customer.id) {
      this.pendingDelete.set(customer.id);
      return;
    }

    this.pendingDelete.set(null);
    this.customerService.delete(customer).subscribe({
      next: () => {
        this.toast.show(`${customer.name} borrado. Sus documentos se conservan.`);
        this.customers.update((list) => list.filter((c) => c.id !== customer.id));
      },
      error: (error: Error) => this.toast.show(error.message, 'error'),
    });
  }
}
