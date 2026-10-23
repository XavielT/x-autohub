import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { SiteSettingsService, StatsMode } from '../../../../shared/services/site-settings.service';
import { StatsService } from '../../../../shared/services/stats.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { SiteStats } from '../../../../shared/models/site-stats.model';
import { BankAccount } from '../../../../shared/models/order.model';
import { SHOWCASE_DISPLAY } from '../../../../shared/data/showcase-stats';
import { compactNumber } from '../../../../shared/utils/compact-number';

/** Una fila de la comparación: la misma métrica en los dos modos. */
interface StatRow {
  label: string;
  showcase: string;
  real: string;
}

const ROWS: { key: keyof SiteStats; label: string }[] = [
  { key: 'vehicles', label: 'Vehiculos' },
  { key: 'parts', label: 'Piezas' },
  { key: 'members', label: 'Miembros' },
];

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
 * Ajustes del sitio: qué números muestra el contador del home y, desde la fase 4,
 * **a dónde transfieren los clientes** y **dónde retiran**.
 *
 * Las cuentas y la dirección de retiro nacen con un valor de ejemplo (migración
 * 0018) marcado como tal. Mientras sigan siendo de ejemplo, el sitio público no
 * las muestra y cae a "te enviamos los datos por WhatsApp": un cliente que
 * transfiere a una cuenta inventada es peor que uno que espera. Aquí se
 * reemplazan por las reales.
 *
 * La sección enseña **los dos modos con sus números al lado** a propósito. El
 * interruptor cambia lo que ve todo el que entra al sitio, incluido quien no
 * tiene sesión; decidir eso a ciegas ("real" ¿es 6 o es 300?) es cómo se acaba
 * dejando la portada peor de lo que estaba sin querer.
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
  private readonly stats = inject(StatsService);
  private readonly toast = inject(ToastService);

  readonly mode = signal<StatsMode | null>(null);
  readonly isSaving = signal(false);

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

  private readonly siteStats = signal<SiteStats | null>(null);

  readonly rows = computed<StatRow[]>(() => {
    const stats = this.siteStats();

    return ROWS.map(({ key, label }) => ({
      label,
      showcase: SHOWCASE_DISPLAY[key],
      real: stats ? compactNumber(stats[key]) : '…',
    }));
  });

  /** Los conteos exactos, para la línea de detalle. */
  readonly exactCounts = computed(() => {
    const stats = this.siteStats();
    if (!stats) return null;

    return `${stats.vehicles} vehiculo(s) · ${stats.parts} pieza(s) · ${stats.members} cuenta(s)`;
  });

  ngOnInit(): void {
    this.settings.getStatsMode().subscribe({
      next: (mode) => this.mode.set(mode),
      error: () => this.toast.show('No pudimos leer el ajuste actual.', 'error'),
    });

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
      error: () => this.toast.show('No pudimos leer la direccion de retiro.', 'error'),
    });

    // Los conteos se piden siempre, esté el sitio en el modo que esté: la
    // gracia del panel es ver qué pasaría al cambiar.
    this.stats.getSiteStats().subscribe({
      next: (stats) => this.siteStats.set(stats),
      error: () => this.toast.show('No pudimos leer los conteos reales.', 'error'),
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
      this.toast.show('Cada cuenta necesita banco, titular y numero.', 'error');
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
      this.toast.show('Escribe la direccion donde se retira.', 'error');
      return;
    }

    this.isSavingPickup.set(true);
    this.settings.setPickupAddress({ address: this.pickupAddress(), hours: this.pickupHours() }).subscribe({
      next: () => {
        this.isSavingPickup.set(false);
        this.pickupIsExample.set(false);
        this.toast.show('Direccion de retiro guardada.');
      },
      error: (err: unknown) => {
        this.isSavingPickup.set(false);
        this.toast.show('No pudimos guardar la direccion.', 'error');
        console.error(err);
      },
    });
  }

  choose(mode: StatsMode): void {
    if (this.mode() === mode || this.isSaving()) return;

    this.isSaving.set(true);
    const previous = this.mode();

    // Optimista, y con vuelta atrás si falla: el clic tiene que sentirse
    // inmediato, pero dejar el botón marcado cuando la base lo rechazó (un
    // moderador colándose por la URL, por ejemplo) sería mentir.
    this.mode.set(mode);

    this.settings.setStatsMode(mode).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.show(
          mode === 'real'
            ? 'El home ya muestra los numeros reales.'
            : 'El home ya muestra los numeros de impresion.',
        );
      },
      error: (err: unknown) => {
        this.mode.set(previous);
        this.isSaving.set(false);
        this.toast.show('No pudimos guardar el ajuste.', 'error');
        console.error(err);
      },
    });
  }
}

const toDraft = (a: BankAccount): AccountDraft => ({ ...a });

const toAccount = (a: AccountDraft): BankAccount => ({ ...a });
