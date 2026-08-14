import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { AdminService } from '../../../../shared/services/admin.service';
import { ToastService } from '../../../../shared/services/toast.service';
import {
  AdminNewsModel,
  AdminPartModel,
  AdminVehicleModel,
} from '../../../../shared/models/admin-inventory.model';

type Tab = 'piezas' | 'vehiculos' | 'noticias';

/**
 * Inventario propio de X AutoHub: catálogo de piezas, vehículos oficiales y
 * noticias. Nada de Hub Market — eso lo publica la comunidad y cada quien
 * administra lo suyo.
 *
 * Cubre lo que se ajusta a diario: precio, existencias y si algo se muestra o no.
 * **Crear artículos nuevos desde cero todavía no está aquí**; un vehículo tiene
 * 17 campos obligatorios y su formulario es un trabajo aparte. Mientras tanto se
 * dan de alta por el Table Editor de Supabase. Ver docs/ROADMAP.md.
 *
 * Las tres listas piden también lo desactivado, que el sitio público no muestra:
 * la política de cada tabla es `using (is_active or public.is_admin())`.
 */
@Component({
  selector: 'app-admin-inventario',
  imports: [DecimalPipe, DatePipe],
  templateUrl: './admin-inventario.html',
  styleUrl: './admin-inventario.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminInventario implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);

  readonly tab = signal<Tab>('piezas');
  readonly isLoading = signal(true);
  readonly savingId = signal<string | null>(null);

  readonly parts = signal<AdminPartModel[]>([]);
  readonly vehicles = signal<AdminVehicleModel[]>([]);
  readonly news = signal<AdminNewsModel[]>([]);

  ngOnInit(): void {
    this.loadAll();
  }

  /**
   * Carga las tres listas de una vez.
   *
   * Son tablas pequeñas (decenas de filas) y así cambiar de pestaña es
   * instantáneo, sin un salto de carga cada vez.
   */
  private loadAll(): void {
    this.isLoading.set(true);
    let pending = 3;
    const done = () => {
      if (--pending === 0) this.isLoading.set(false);
    };
    const fail = (error: Error) => {
      this.toast.show(error.message, 'error');
      done();
    };

    this.admin.getInventoryParts().subscribe({
      next: (v) => { this.parts.set(v); done(); },
      error: fail,
    });
    this.admin.getInventoryVehicles().subscribe({
      next: (v) => { this.vehicles.set(v); done(); },
      error: fail,
    });
    this.admin.getInventoryNews().subscribe({
      next: (v) => { this.news.set(v); done(); },
      error: fail,
    });
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  // --- Piezas --------------------------------------------------------------

  togglePart(part: AdminPartModel): void {
    this.savingId.set(`p${part.id}`);
    this.admin.updatePart(part.id, { isActive: !part.isActive }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.parts.update((l) =>
          l.map((p) => (p.id === part.id ? { ...p, isActive: !part.isActive } : p)),
        );
        this.toast.show(part.isActive ? 'Pieza oculta del catalogo.' : 'Pieza visible.');
      },
      error: (e: Error) => { this.savingId.set(null); this.toast.show(e.message, 'error'); },
    });
  }

  savePartField(part: AdminPartModel, field: 'price' | 'stock', event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = Number(raw);

    if (!Number.isFinite(value) || value < 0) {
      this.toast.show('Ese valor no es valido.', 'error');
      return;
    }
    if (value === part[field]) return;

    this.savingId.set(`p${part.id}`);
    this.admin.updatePart(part.id, { [field]: value }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.parts.update((l) => l.map((p) => (p.id === part.id ? { ...p, [field]: value } : p)));
        this.toast.show('Guardado.');
      },
      error: (e: Error) => { this.savingId.set(null); this.toast.show(e.message, 'error'); },
    });
  }

  // --- Vehiculos -----------------------------------------------------------

  toggleVehicle(v: AdminVehicleModel): void {
    this.savingId.set(`v${v.id}`);
    this.admin.updateVehicle(v.id, { isAvailable: !v.isAvailable }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.vehicles.update((l) =>
          l.map((x) => (x.id === v.id ? { ...x, isAvailable: !v.isAvailable } : x)),
        );
        this.toast.show(v.isAvailable ? 'Vehiculo marcado como vendido.' : 'Vehiculo disponible.');
      },
      error: (e: Error) => { this.savingId.set(null); this.toast.show(e.message, 'error'); },
    });
  }

  saveVehiclePrice(v: AdminVehicleModel, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value) || value < 0) {
      this.toast.show('Ese precio no es valido.', 'error');
      return;
    }
    if (value === v.price) return;

    this.savingId.set(`v${v.id}`);
    this.admin.updateVehicle(v.id, { price: value }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.vehicles.update((l) => l.map((x) => (x.id === v.id ? { ...x, price: value } : x)));
        this.toast.show('Precio actualizado.');
      },
      error: (e: Error) => { this.savingId.set(null); this.toast.show(e.message, 'error'); },
    });
  }

  // --- Noticias ------------------------------------------------------------

  toggleNews(n: AdminNewsModel): void {
    this.savingId.set(`n${n.id}`);
    this.admin.updateNews(n.id, !n.isPublished).subscribe({
      next: () => {
        this.savingId.set(null);
        this.news.update((l) =>
          l.map((x) => (x.id === n.id ? { ...x, isPublished: !n.isPublished } : x)),
        );
        this.toast.show(n.isPublished ? 'Noticia despublicada.' : 'Noticia publicada.');
      },
      error: (e: Error) => { this.savingId.set(null); this.toast.show(e.message, 'error'); },
    });
  }
}
