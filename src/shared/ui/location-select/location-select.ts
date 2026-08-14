import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type { Map as LeafletMap } from 'leaflet';
import {
  DO_LOCATIONS,
  LocationOption,
  filterLocations,
  isCanonicalLocation,
  nearestLocation,
} from '../../data/locations';

/** Dónde queda la hoja de estilos de Leaflet, copiada por `angular.json`. */
const LEAFLET_CSS_HREF = 'assets/leaflet/leaflet.css';

/**
 * Selector de ubicación: lista buscable, o mapa.
 *
 * Sustituye los campos de texto libre de `registro`, `publicar` y el formulario
 * de vehículos del panel. El valor que expone es **siempre** un nombre de la
 * lista canónica (`shared/data/locations.ts`), venga de la lista o de un clic en
 * el mapa, así que dos publicaciones de la misma provincia se pueden agrupar y
 * filtrar — que era imposible cuando uno escribía "Santo Domingo" y otro
 * "santo domingo este".
 *
 * Implementa `ControlValueAccessor`, así que entra en un formulario reactivo con
 * `formControlName="location"` sin nada alrededor, y funciona igual siendo
 * opcional (registro) que obligatorio (publicar). Para el patrón de la fase 1
 * basta pasarle `[invalid]="showError('location')"`.
 *
 * **Leaflet se carga de forma diferida**, con `import('leaflet')` la primera vez
 * que se abre el mapa, y su CSS se inyecta en ese momento. Así ni la librería ni
 * su hoja de estilos entran en el bundle inicial: quien nunca abre el mapa —la
 * mayoría, porque la lista es más rápida— no descarga nada de esto.
 */
@Component({
  selector: 'app-location-select',
  imports: [],
  templateUrl: './location-select.html',
  styleUrl: './location-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: LocationSelect, multi: true },
  ],
})
export class LocationSelect implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly placeholder = input('Selecciona una ubicacion');
  /** Marca el control en rojo. Se conecta con el `showError()` de la página. */
  readonly invalid = input(false);
  /** id del botón, para que el `<label for>` de la página lo apunte. */
  readonly inputId = input('location');

  readonly value = signal('');
  readonly isOpen = signal(false);
  readonly isDisabled = signal(false);
  readonly query = signal('');
  readonly showMap = signal(false);
  readonly isMapLoading = signal(false);
  readonly mapError = signal('');

  /** Cuál opción está resaltada con el teclado. */
  readonly activeIndex = signal(0);

  readonly options = computed(() => filterLocations(this.query()));

  /**
   * true cuando el valor que llegó no está en la lista.
   *
   * Los datos que ya existían traen municipios ("Santo Domingo Este", "Punta
   * Cana") y pueblos ("Bani", "Neiba"). Se conservan y se avisa, en vez de
   * descartarlos: si el control los vaciara al abrir un formulario de edición,
   * guardar un cambio de precio borraría la ubicación sin que nadie lo pidiera.
   */
  readonly isOutsideList = computed(() => {
    const current = this.value();
    return current.length > 0 && !isCanonicalLocation(current);
  });

  private readonly mapHost = viewChild<ElementRef<HTMLElement>>('mapHost');
  private map: LeafletMap | null = null;

  // --- ControlValueAccessor ------------------------------------------------

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    // El contenedor del mapa vive dentro de un `@if`, así que no existe hasta
    // que el modo mapa se abre. El efecto corre después del render, cuando la
    // consulta ya resolvió el elemento.
    effect(() => {
      const element = this.mapHost()?.nativeElement;
      if (element && !this.map) void this.initMap(element);
    });
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  // --- Abrir y cerrar ------------------------------------------------------

  toggle(): void {
    if (this.isDisabled()) return;
    this.isOpen() ? this.close() : this.open();
  }

  open(): void {
    this.isOpen.set(true);
    this.query.set('');
    this.activeIndex.set(0);

    // El foco al buscador después del render: el input no existe hasta que el
    // panel se dibuja.
    setTimeout(() => {
      this.host.nativeElement.querySelector<HTMLInputElement>('.loc__search')?.focus();
    });
  }

  close(): void {
    this.isOpen.set(false);
    this.showMap.set(false);
    this.destroyMap();
    // `touched` se marca al cerrar, no al abrir: abrir y arrepentirse no debería
    // dejar el campo en rojo.
    this.onTouched();
  }

  /** Cerrar al hacer clic fuera. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  // --- Seleccionar ---------------------------------------------------------

  select(option: LocationOption): void {
    this.value.set(option.name);
    this.onChange(option.name);
    this.close();
  }

  onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    // Al filtrar, el resaltado vuelve arriba: si se quedara en el índice viejo
    // podría apuntar fuera de la lista nueva.
    this.activeIndex.set(0);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const options = this.options();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (options.length) this.activeIndex.set((this.activeIndex() + 1) % options.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (options.length) {
          this.activeIndex.set((this.activeIndex() - 1 + options.length) % options.length);
        }
        break;
      case 'Enter': {
        event.preventDefault();
        const option = options[this.activeIndex()];
        if (option) this.select(option);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        this.host.nativeElement.querySelector<HTMLElement>('.loc__control')?.focus();
        break;
    }
  }

  /** Abre el panel con el teclado, desde el botón cerrado. */
  onControlKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.open();
    }
  }

  // --- Mapa ----------------------------------------------------------------

  async toggleMap(): Promise<void> {
    if (this.showMap()) {
      this.showMap.set(false);
      this.destroyMap();
      return;
    }
    this.mapError.set('');
    this.isMapLoading.set(true);
    this.showMap.set(true);
    // El mapa lo crea el efecto en cuanto su contenedor existe.
  }

  private async initMap(container: HTMLElement): Promise<void> {
    try {
      await this.ensureLeafletCss();
      // Aquí está el punto del código que mantiene Leaflet fuera del bundle
      // inicial: el bundler lo empaqueta en un chunk aparte que solo se pide al
      // ejecutar esta línea.
      //
      // Se apunta a la build ESM y no a `'leaflet'` porque el paquete resuelve
      // por `main` a CommonJS, y eso hace que el build avise de un bailout de
      // optimización. Ver `src/types/leaflet-esm.d.ts`.
      const L = await import('leaflet/dist/leaflet-src.esm.js');

      const map = L.map(container, { attributionControl: true }).setView([18.9, -70.4], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 12,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      // `circleMarker` y no el marcador por defecto: es SVG, así que no hace
      // falta copiar los PNG de los iconos ni acertar con sus rutas relativas.
      for (const option of DO_LOCATIONS) {
        L.circleMarker([option.lat, option.lng], {
          radius: 7,
          color: '#ffb300',
          fillColor: '#ffb300',
          fillOpacity: 0.85,
          weight: 2,
        })
          .addTo(map)
          .bindTooltip(option.name, { direction: 'top' })
          .on('click', () => this.select(option));
      }

      // Un clic en cualquier otro punto resuelve a la provincia más cercana, así
      // que no hay forma de terminar con un valor fuera de la lista.
      map.on('click', (event) => this.select(nearestLocation(event.latlng.lat, event.latlng.lng)));

      this.map = map;
      this.isMapLoading.set(false);
    } catch (error) {
      console.error('[location-select] no se pudo cargar el mapa', error);
      this.isMapLoading.set(false);
      this.showMap.set(false);
      this.mapError.set('No pudimos cargar el mapa. Elige de la lista.');
    }
  }

  /**
   * Inyecta la hoja de estilos de Leaflet una sola vez.
   *
   * No se importa desde el SCSS ni se declara en `angular.json > styles` porque
   * las dos cosas la meterían en el CSS inicial de toda la app, que es justo lo
   * que se quiere evitar: son ~15 KB que solo importan si alguien abre el mapa.
   */
  private ensureLeafletCss(): Promise<void> {
    if (document.querySelector(`link[href="${LEAFLET_CSS_HREF}"]`)) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS_HREF;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error('No se pudo cargar leaflet.css'));
      document.head.appendChild(link);
    });
  }

  private destroyMap(): void {
    this.map?.remove();
    this.map = null;
  }
}
