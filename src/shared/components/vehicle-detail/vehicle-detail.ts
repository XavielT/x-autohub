import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DOCUMENT, DecimalPipe } from '@angular/common';
import { ExpandableText } from '../../ui/expandable-text/expandable-text';
import { ImageGallery } from '../../ui/image-gallery/image-gallery';
import { TestBadge } from '../../ui/test-badge/test-badge';
import { ToastService } from '../../services/toast.service';
import { VehicleCardSpec } from '../vehicle-card/vehicle-card';

/**
 * El diseño común de la ficha de un vehículo: `/car-details/:id` (Hub Market) y
 * `/auto-hub-details/:id` (Auto Hub) traen sus datos y se los pasan a este componente.
 *
 * Galería grande con miniaturas y zoom · título, ubicación con pin y precio ámbar a la
 * derecha · especificaciones en grilla de 3 (solo las que tienen dato) · descripción ·
 * vendedor con avatar y "Contactar por WhatsApp" · "Compartir". En el teléfono el precio y el
 * botón de WhatsApp quedan fijos abajo. Los avisos (`[notice]`) y los vehículos relacionados
 * (`[related]`) entran por proyección.
 */
@Component({
  selector: 'app-vehicle-detail',
  imports: [DecimalPipe, ExpandableText, ImageGallery, TestBadge],
  templateUrl: './vehicle-detail.html',
  styleUrl: './vehicle-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleDetail {
  private readonly toast = inject(ToastService);
  private readonly doc = inject(DOCUMENT);

  readonly images = input.required<readonly string[]>();
  readonly title = input.required<string>();
  readonly location = input<string | null>(null);
  readonly price = input.required<number>();
  readonly specs = input<readonly (VehicleCardSpec | { label: string; value: string | number | null | undefined })[]>([]);
  readonly description = input('');
  readonly sellerName = input.required<string>();
  /** Enlace de WhatsApp; vacío = no hay botón. */
  readonly waLink = input('');
  /** El teléfono tal como se lee (`809-953-9782`), si el vendedor lo muestra. */
  readonly contact = input('');
  readonly isTest = input(false);

  /** Solo las especificaciones con dato: nada de "N/A". */
  readonly visibleSpecs = computed(() =>
    this.specs()
      .filter((s) => s.value !== null && s.value !== undefined && String(s.value).trim() !== '')
      .map((s) => ({ label: s.label, value: String(s.value) })),
  );

  readonly initial = computed(() => this.sellerName().trim().charAt(0).toUpperCase() || 'X');

  /** Web Share API; sin ella, copia el enlace y avisa con un toast. */
  async share(): Promise<void> {
    const url = this.doc.defaultView?.location.href ?? '';
    const nav = this.doc.defaultView?.navigator;
    try {
      if (nav?.share) {
        await nav.share({ title: this.title(), url });
        return;
      }
      await nav?.clipboard?.writeText(url);
      this.toast.show('Enlace copiado.');
    } catch (error) {
      // Cerrar el cuadro de compartir lanza AbortError: no es un fallo.
      if ((error as DOMException)?.name === 'AbortError') return;
      this.toast.show('No pudimos compartir el enlace.', 'error');
    }
  }
}
