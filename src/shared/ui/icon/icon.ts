import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Un círculo como trazo (los iconos se guardan solo como trazos `d`, así la plantilla no necesita `innerHTML`). */
const circle = (cx: number, cy: number, r: number): string =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Un rectángulo con esquinas redondeadas como trazo. */
const rect = (x: number, y: number, w: number, h: number, r = 2): string =>
  `M${x + r} ${y}H${x + w - r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h - r}a${r} ${r} 0 0 1 ${-r} ${r}H${x + r}` +
  `a${r} ${r} 0 0 1 ${-r} ${-r}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}z`;

/**
 * Los iconos del sitio: trazos de 24×24 que toman el color del texto (`currentColor`).
 * Para sumar uno, agrega su nombre aquí y sus trazos en `ICONS`.
 */
export type IconName =
  | 'shield-check'
  | 'tag'
  | 'package'
  | 'ticket'
  | 'wrench'
  | 'boxes'
  | 'image'
  | 'file-text'
  | 'users'
  | 'sliders'
  | 'bolt'
  | 'droplet'
  | 'plug'
  | 'bag'
  | 'layers'
  | 'receipt'
  | 'clipboard'
  | 'plus'
  | 'printer'
  | 'message'
  | 'save'
  | 'copy'
  | 'arrow-right'
  | 'arrow-left'
  | 'arrow-up'
  | 'arrow-down'
  | 'x'
  | 'trash'
  | 'building'
  | 'search'
  | 'eye'
  | 'car'
  | 'newspaper'
  | 'folder';

const ICONS: Record<IconName, readonly string[]> = {
  'shield-check': ['M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z', 'M9 12l2 2 4-4'],
  tag: ['M3 12V4h8l10 10-8 8z', circle(7.5, 8.5, 1.2)],
  package: ['M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z', 'M3 7.5l9 4.5 9-4.5', 'M12 12v9'],
  ticket: ['M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z', 'M14 6v2M14 11v2M14 16v2'],
  wrench: ['M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.9 1.9 0 0 0 2.7 2.7l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z'],
  boxes: [rect(3, 11, 8, 8, 1), rect(13, 11, 8, 8, 1), rect(8, 3, 8, 7, 1)],
  image: [rect(3, 4, 18, 16, 2), circle(9, 10, 1.6), 'M21 16l-5-5-8 8'],
  'file-text': ['M6 3h8l5 5v13H6z', 'M14 3v5h5', 'M9 13h7M9 17h7'],
  users: [circle(9, 8, 3.2), 'M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1', 'M16 5a3 3 0 0 1 0 6', 'M18 14.5a5 5 0 0 1 3 4.5v1'],
  sliders: ['M4 7h10M18 7h2M4 17h2M10 17h10', circle(16, 7, 2), circle(8, 17, 2)],
  bolt: ['M13 2L5 14h6l-1 8 8-12h-6z'],
  droplet: ['M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z'],
  plug: ['M9 3v5M15 3v5', 'M6 8h12v3a6 6 0 0 1-12 0z', 'M12 17v4'],
  bag: ['M5 8h14l-1 12H6z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
  receipt: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6M9 12h6'],
  clipboard: [rect(6, 5, 12, 16, 2), 'M9 5V4h6v1', 'M9 11h6M9 15h4'],
  plus: ['M12 5v14M5 12h14'],
  printer: ['M7 9V3h10v6', rect(4, 9, 16, 8, 2), 'M7 14h10v7H7z'],
  message: ['M4 20l1.5-4A8 8 0 1 1 8 18.5z'],
  save: ['M5 4h11l3 3v13H5z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
  copy: [rect(9, 9, 11, 11, 2), 'M5 15V6a2 2 0 0 1 2-2h8'],
  'arrow-right': ['M5 12h14M13 6l6 6-6 6'],
  'arrow-left': ['M19 12H5M11 6l-6 6 6 6'],
  'arrow-up': ['M12 19V5M6 11l6-6 6 6'],
  'arrow-down': ['M12 5v14M6 13l6 6 6-6'],
  x: ['M6 6l12 12M18 6L6 18'],
  trash: ['M4 7h16M10 11v6M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  building: ['M3 21h18', 'M5 21V4h9v17', 'M14 9h5v12', 'M8 8h3M8 12h3M8 16h3'],
  search: [circle(11, 11, 6), 'M20 20l-4.5-4.5'],
  car: ['M3 15v-3l2-5h14l2 5v3z', 'M3 12h18', circle(7.5, 17, 1.8), circle(16.5, 17, 1.8)],
  newspaper: [rect(4, 4, 13, 16, 2), 'M17 8h3v10a2 2 0 0 1-2 2', 'M8 8h5M8 12h5M8 16h3'],
  folder: ['M3 6h7l2 2h9v11H3z'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', circle(12, 12, 3)],
};

/**
 * Un icono SVG del sitio. Decorativo por defecto (`aria-hidden`): el texto o el `aria-label` del botón
 * que lo contiene es lo que lee un lector de pantalla. Toma el color y el tamaño de la fuente
 * (`size` en px, 20 por defecto).
 */
@Component({
  selector: 'app-icon',
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true" focusable="false" [attr.width]="size()" [attr.height]="size()">
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: [':host { display: inline-flex; flex: none; line-height: 0; vertical-align: middle; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  protected readonly paths = computed(() => ICONS[this.name()]);
}
