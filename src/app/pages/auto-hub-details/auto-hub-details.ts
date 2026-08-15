import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { AutoHubModel } from '../../../shared/models/auto-hub.model';
import { AutoHubService } from '../../../shared/services/auto-hub.service';
import { formatDrPhone } from '../../../shared/utils/phone';
import { buildWaLink } from '../../../shared/utils/whatsapp';
import { TestBadge } from '../../../shared/ui/test-badge/test-badge';

@Component({
  selector: 'app-auto-hub-details',
  imports: [DecimalPipe, SlicePipe, TestBadge],
  templateUrl: './auto-hub-details.html',
  styleUrl: './auto-hub-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoHubDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly autoHubService = inject(AutoHubService);

  readonly auto = signal<AutoHubModel | undefined>(undefined);
  readonly images = signal<string[]>([]);
  readonly currentImageIndex = signal(0);
  readonly isLoading = signal(true);

  readonly isDescriptionExpanded = signal(false);
  readonly maxDescriptionLength = 200;

  /**
   * El teléfono como se lee, no como se guarda: `8099539782` → `809-953-9782`.
   *
   * En Auto Hub el `contact` es de la empresa y es obligatorio en el esquema,
   * así que aquí no hay caso de "sin teléfono" — a diferencia de Hub Market,
   * donde lo pone el vendedor y es opcional.
   */
  readonly contactDisplay = computed(() => formatDrPhone(this.auto()?.contact ?? ''));

  /** Enlace de WhatsApp al concesionario. El mensaje nombra el vehículo. */
  readonly waLink = computed(() => {
    const auto = this.auto();
    if (!auto?.contact) return '';
    return buildWaLink(
      auto.contact,
      `Hola! Vi el ${auto.brand} ${auto.model} en X AutoHub y me interesa.`,
    );
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.isLoading.set(true);
      this.currentImageIndex.set(0);

      this.autoHubService.getById(id).subscribe({
        next: (auto) => {
          this.auto.set(auto);
          this.images.set(auto?.images ?? []);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
    });
  }

  selectImage(index: number): void {
    this.currentImageIndex.set(index);
  }

  prevImage(): void {
    const total = this.images().length;
    if (total <= 1) return;
    this.currentImageIndex.update((i) => (i - 1 + total) % total);
  }

  nextImage(): void {
    const total = this.images().length;
    if (total <= 1) return;
    this.currentImageIndex.update((i) => (i + 1) % total);
  }

  toggleDescription(): void {
    this.isDescriptionExpanded.update((expanded) => !expanded);
  }
}
