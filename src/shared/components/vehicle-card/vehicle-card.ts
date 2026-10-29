import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TestBadge } from '../../ui/test-badge/test-badge';

/** Un dato de la fila de especificaciones: etiqueta arriba, valor abajo. */
export interface VehicleCardSpec {
  label: string;
  value: string;
}

/**
 * La tarjeta de un vehículo (y, en su variante `square`, de una pieza o accesorio de
 * Hub Market). Es **la única**: `/auto-hub`, `/hub-market`, "Vehículos relacionados" y el
 * perfil la usan a través de `app-car-card`, `app-autohub-card` y `app-hub-market-card`,
 * que solo traducen su modelo a estas entradas.
 *
 * Estructura fija, para que una fila de tarjetas mida lo mismo: imagen 16:10 (1:1 en
 * `square`) · nombre (2 líneas máximo) · año y km · precio en su propia fila · hasta
 * tres especificaciones en columnas iguales.
 */
@Component({
  selector: 'app-vehicle-card',
  imports: [RouterLink, NgOptimizedImage, DecimalPipe, TestBadge],
  templateUrl: './vehicle-card.html',
  styleUrl: './vehicle-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleCard {
  readonly link = input.required<string | readonly string[]>();
  readonly image = input<string | null>(null);
  readonly title = input.required<string>();
  readonly price = input.required<number>();
  readonly year = input<number | null>(null);
  readonly mileage = input<number | null>(null);
  /** Línea de apoyo: quién lo publica y dónde. */
  readonly meta = input<string | null>(null);
  /** "De la comunidad" o "Verificado por X AutoHub": va sobre la imagen. */
  readonly badge = input<string | null>(null);
  readonly specs = input<readonly VehicleCardSpec[]>([]);
  readonly isTest = input(false);
  /** Imagen cuadrada, sin año ni km ni especificaciones: piezas y accesorios. */
  readonly square = input(false);
  /** Marca la imagen como LCP; solo para las primeras tarjetas de una lista. */
  readonly priority = input(false);

  readonly routerLinkValue = computed(() => {
    const l = this.link();
    return typeof l === 'string' ? [l] : [...l];
  });

  /**
   * `NgOptimizedImage` rechaza las data URLs y lanza (NG02952): en modo simulado una
   * publicación recién hecha las trae, y se llevaba la tarjeta entera por delante.
   */
  readonly isDataUrl = computed(() => this.image()?.startsWith('data:') ?? false);

  /** Si falla la carga de la foto se cambia por el SVG genérico del sitio. */
  protected onError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('assets/icons/auto-icon.svg')) img.src = 'assets/icons/auto-icon.svg';
  }
}
