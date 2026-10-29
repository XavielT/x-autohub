import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { SiteSettingsService } from '../../../../shared/services/site-settings.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { BankAccount } from '../../../../shared/models/order.model';

/** Una cuenta mientras se edita: los campos son texto libre hasta que se guarda. */
interface AccountDraft {
  bank: string;
  holder: string;
  number: string;
  type: string;
  isExample: boolean;
}

const emptyAccount = (): AccountDraft => ({ bank: '', holder: '', number: '', type: 'Corriente', isExample: false });

/**
 * Ajustes del sitio: **a dónde transfieren los clientes** y **dónde retiran**.
 *
 * Las cuentas y la dirección de retiro nacen con un valor de ejemplo (migración
 * 0018) marcado como tal. Mientras sigan siendo de ejemplo, el sitio público no
 * las muestra y cae a "te enviamos los datos por WhatsApp": un cliente que
 * transfiere a una cuenta inventada es peor que uno que espera. Aquí se
 * reemplazan por las reales.
 *
 * (Hasta la fase 6 había aquí un interruptor para los números del contador del
 * home. El pivote quitó ese contador y el interruptor se fue con él.)
 */
@Component({
  selector: 'app-admin-ajustes',
  imports: [],
  templateUrl: './admin-ajustes.html',
  styleUrl: './admin-ajustes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAjustes implements OnInit {
  private readonly settings = inject(SiteSettingsService);
  private readonly toast = inject(ToastService);

  readonly accounts = signal<AccountDraft[]>([]);
  readonly isSavingAccounts = signal(false);
  readonly pickupAddress = signal('');
  readonly pickupHours = signal('');
  /** El valor de retiro que hay guardado todavía es el de ejemplo. */
  readonly pickupIsExample = signal(false);
  readonly isSavingPickup = signal(false);

  /** Mientras todas las cuentas guardadas sean de ejemplo, el sitio no muestra ninguna. */
  readonly onlyExampleAccounts = computed(
    () => this.accounts().length > 0 && this.accounts().every((a) => a.isExample),
  );

  ngOnInit(): void {
    this.settings.getBankAccounts().subscribe({
      next: (accounts) => this.accounts.set(accounts.map(toDraft)),
      error: () => this.toast.show('No pudimos leer las cuentas bancarias.', 'error'),
    });

    this.settings.getPickupAddress().subscribe({
      next: (pickup) => {
        this.pickupAddress.set(pickup?.address ?? '');
        this.pickupHours.set(pickup?.hours ?? '');
        this.pickupIsExample.set(pickup?.isExample ?? false);
      },
      error: () => this.toast.show('No pudimos leer la dirección de retiro.', 'error'),
    });
  }

  // --- Cuentas bancarias ---------------------------------------------------

  addAccount(): void {
    this.accounts.update((list) => [...list, emptyAccount()]);
  }

  removeAccount(index: number): void {
    this.accounts.update((list) => list.filter((_, i) => i !== index));
  }

  setAccountField(index: number, field: 'bank' | 'holder' | 'number' | 'type', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.accounts.update((list) => list.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  }

  saveAccounts(): void {
    if (this.isSavingAccounts()) return;

    const incomplete = this.accounts().some((a) => !a.bank.trim() || !a.number.trim() || !a.holder.trim());
    if (incomplete) {
      this.toast.show('Cada cuenta necesita banco, titular y número.', 'error');
      return;
    }

    this.isSavingAccounts.set(true);
    this.settings.setBankAccounts(this.accounts().map(toAccount)).subscribe({
      next: () => {
        this.isSavingAccounts.set(false);
        // Al guardar dejan de ser de ejemplo: lo que se escribe aqui es real.
        this.accounts.update((list) => list.map((a) => ({ ...a, isExample: false })));
        this.toast.show('Cuentas guardadas. Los clientes ya las ven al hacer su pedido.');
      },
      error: (err: unknown) => {
        this.isSavingAccounts.set(false);
        this.toast.show('No pudimos guardar las cuentas.', 'error');
        console.error(err);
      },
    });
  }

  // --- Direccion de retiro -------------------------------------------------

  setPickupField(field: 'address' | 'hours', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    (field === 'address' ? this.pickupAddress : this.pickupHours).set(value);
  }

  savePickup(): void {
    if (this.isSavingPickup()) return;

    if (!this.pickupAddress().trim()) {
      this.toast.show('Escribe la dirección donde se retira.', 'error');
      return;
    }

    this.isSavingPickup.set(true);
    this.settings.setPickupAddress({ address: this.pickupAddress(), hours: this.pickupHours() }).subscribe({
      next: () => {
        this.isSavingPickup.set(false);
        this.pickupIsExample.set(false);
        this.toast.show('Dirección de retiro guardada.');
      },
      error: (err: unknown) => {
        this.isSavingPickup.set(false);
        this.toast.show('No pudimos guardar la dirección.', 'error');
        console.error(err);
      },
    });
  }
}

const toDraft = (a: BankAccount): AccountDraft => ({ ...a });

const toAccount = (a: AccountDraft): BankAccount => ({ ...a });
