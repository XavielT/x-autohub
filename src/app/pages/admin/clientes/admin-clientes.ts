import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Skeleton } from '../../../../shared/ui/skeleton/skeleton';
import { Avatar } from '../../../../shared/ui/avatar/avatar';
import { Icon } from '../../../../shared/ui/icon/icon';
import { BusinessCustomerService, validateCustomer } from '../../../../shared/services/business-customer.service';
import { BusinessDocumentService } from '../../../../shared/services/business-document.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { BusinessCustomer, BusinessDocument, CustomerDraft, CustomerVehicle } from '../../../../shared/models/business-document.model';
import { searchCustomers } from '../../../../shared/utils/document-customers';
import { buildWaLink } from '../../../../shared/utils/whatsapp';

type TextKey = 'name' | 'phone' | 'email' | 'rnc' | 'address' | 'notes';

const value = (event: Event): string => (event.target as HTMLInputElement | HTMLTextAreaElement).value;

const blankVehicle = (): CustomerVehicle => ({ text: '', plate: '', mileage: '', vin: '' });

const blank = (): CustomerDraft => ({ id: null, name: '', phone: '', email: '', rnc: '', address: '', notes: '', vehicles: [] });

const toDraft = (c: BusinessCustomer): CustomerDraft => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  email: c.email,
  rnc: c.rnc,
  address: c.address,
  notes: c.notes,
  vehicles: c.vehicles.map((v) => ({ ...v })),
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
  imports: [RouterLink, Skeleton, Avatar, Icon],
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
    return q ? searchCustomers(this.customers(), q) : this.customers();
  });

  /** Los documentos de cada cliente, del más reciente al más viejo. */
  private readonly docsByCustomer = computed(() => {
    const map = new Map<string, BusinessDocument[]>();
    for (const doc of [...this.documents()].sort((a, b) => +b.createdAt - +a.createdAt)) {
      if (!doc.customerId) continue;
      map.set(doc.customerId, [...(map.get(doc.customerId) ?? []), doc]);
    }
    return map;
  });

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
  }

  // --- Formulario ----------------------------------------------------------

  startNew(): void {
    this.pendingDelete.set(null);
    this.draft.set(blank());
  }

  edit(customer: BusinessCustomer): void {
    this.pendingDelete.set(null);
    this.draft.set(toDraft(customer));
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
