import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OfflineState } from '../../../shared/components/offline-state/offline-state';
import { ServiceCard } from '../../../shared/components/service-card/service-card';
import { ServiceWorks } from '../../../shared/components/service-works/service-works';
import {
  AvailabilityRule,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  ServiceCategory,
  ServiceModel,
  ServiceWorkModel,
} from '../../../shared/models/service.model';
import { PickupAddress } from '../../../shared/models/order.model';
import { SeoService } from '../../../shared/services/seo.service';
import { OnlineService } from '../../../shared/services/online.service';
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { SiteSettingsService } from '../../../shared/services/site-settings.service';
import { STORE_PHONE_DISPLAY, storeWhatsAppLink } from '../../../shared/utils/contact';
import { summarizeHours } from '../../../shared/utils/hours';

import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
interface CategoryGroup {
  category: ServiceCategory;
  label: string;
  services: ServiceModel[];
}

/** El nombre corto de cada categoría en la fila de chips. */
const CHIP_LABELS: Partial<Record<ServiceCategory, string>> = { diagnostico: 'Diagnóstico' };

/**
 * /servicios — lo que vende el taller, cómo se cotiza y cómo se agenda.
 *
 * De arriba abajo: dos botones grandes (cotizar por WhatsApp, agendar), una fila de
 * chips de categoría (pegajosa al hacer scroll), **una** grilla con todos los servicios
 * filtrada por el chip, los trabajos realizados (solo si el taller ya publicó alguno),
 * una línea honesta de lo que **no** se hace, y dónde y cuándo se atiende.
 */
@Component({
  selector: 'app-servicios',
  imports: [Skeleton, RouterLink, ServiceCard, ServiceWorks, OfflineState],
  templateUrl: './servicios.html',
  styleUrl: './servicios.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Servicios implements OnInit {
  private readonly catalog = inject(ServiceCatalogService);
  private readonly settings = inject(SiteSettingsService);
  protected readonly online = inject(OnlineService);

  readonly services = signal<ServiceModel[]>([]);
  readonly works = signal<ServiceWorkModel[]>([]);
  readonly rules = signal<AvailabilityRule[]>([]);
  readonly pickup = signal<PickupAddress | null>(null);
  readonly isLoading = signal(true);
  readonly hasError = signal(false);

  readonly phone = STORE_PHONE_DISPLAY;
  readonly quoteLink = storeWhatsAppLink('Hola X AutoHub, quiero cotizar un servicio');

  /** El catálogo por categoría, en el orden fijo de `SERVICE_CATEGORIES`; una categoría vacía no sale. */
  readonly groups = computed<CategoryGroup[]>(() =>
    SERVICE_CATEGORIES.map((category) => ({
      category,
      label: SERVICE_CATEGORY_LABELS[category],
      services: this.services().filter((s) => s.category === category),
    })).filter((g) => g.services.length > 0),
  );

  /** El chip elegido: `null` es "Todos". */
  readonly selected = signal<ServiceCategory | null>(null);

  /** Los chips: solo las categorías que tienen servicios. */
  readonly chips = computed(() =>
    this.groups().map((g) => ({ category: g.category, label: CHIP_LABELS[g.category] ?? g.label })),
  );

  /** Todas las tarjetas, en el orden de las categorías, filtradas por el chip. */
  readonly visible = computed(() => {
    const only = this.selected();
    return this.groups()
      .filter((g) => only === null || g.category === only)
      .flatMap((g) => g.services.map((service) => ({ service, categoryLabel: g.label })));
  });

  readonly hours = computed(() => summarizeHours(this.rules()));

  select(category: ServiceCategory | null): void {
    this.selected.set(category);
  }

  private readonly seo = inject(SeoService);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.seo.reset());
  }

  ngOnInit(): void {
    this.seo.set({
      title: 'Servicios de taller | X AutoHub',
      description:
        'Instalación de accesorios, mantenimiento, mecánica ligera, sistema eléctrico y aire acondicionado en el taller de X AutoHub, en República Dominicana. Cotiza por WhatsApp o agenda tu cita.',
      path: '/servicios',
    });
    this.loadServices();

    // Lo demás es complemento: si falla, la página sigue con lo que tiene.
    this.catalog.getWorks().subscribe({ next: (w) => this.works.set(w), error: () => undefined });
    this.catalog.getAvailability().subscribe({ next: (r) => this.rules.set(r), error: () => undefined });
    this.settings.getPickupAddress().subscribe({
      // Una dirección de ejemplo no se le enseña a nadie como si fuera la real.
      next: (a) => this.pickup.set(a && !a.isExample ? a : null),
      error: () => undefined,
    });
  }

  /** También es el "Reintentar" del estado sin conexión. */
  loadServices(): void {
    this.hasError.set(false);
    this.isLoading.set(true);

    this.catalog.getServices().subscribe({
      next: (services) => {
        this.services.set(services);
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }
}
