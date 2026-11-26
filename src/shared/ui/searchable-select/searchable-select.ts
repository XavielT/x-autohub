import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { trackKeyboard } from '../../utils/keyboard-inset';

export interface SelectOption<T extends string | number = string | number> {
  value: T;
  label: string;
}

/** Minúsculas y sin acentos, para que "citroen" encuentre "Citroën". */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Las opciones que coinciden con lo escrito, sin distinguir acentos ni mayúsculas.
 *
 * - Busca por cualquier parte del texto ("roll" encuentra "Corolla") y por varias palabras en cualquier orden
 *   ("land cr" encuentra "Land Cruiser", "civic honda" también).
 * - Ordena por cercanía: primero las que **empiezan** con lo escrito, luego las que tienen una palabra que empieza
 *   así y al final las que solo lo contienen; a igualdad, el orden original (el alfabético de la lista).
 */
export function filterOptions<T extends string | number>(
  options: readonly SelectOption<T>[],
  query: string,
): SelectOption<T>[] {
  const q = normalizeSearch(query);
  if (!q) return [...options];

  const tokens = q.split(/\s+/);
  const rank = (label: string): number => {
    if (label.startsWith(q)) return 0;
    if (label.includes(` ${q}`)) return 1;
    return tokens.every((t) => label.startsWith(t) || label.includes(` ${t}`)) ? 2 : 3;
  };

  return options
    .map((option, index) => ({ option, index, label: normalizeSearch(option.label) }))
    .filter((x) => tokens.every((t) => x.label.includes(t)))
    .sort((a, b) => rank(a.label) - rank(b.label) || a.index - b.index)
    .map((x) => x.option);
}

/**
 * Lista desplegable con búsqueda incremental. Sin librerías.
 *
 * Reemplaza a los `<select>` nativos donde la lista es larga (marcas, años,
 * provincias). Teclado: flechas, Enter, Escape y Tab. En pantallas de hasta
 * 640px la lista se abre como hoja inferior (ver el SCSS).
 *
 * `value` es un `model`: se usa con `[(value)]` o con `[value]` + `(valueChange)`.
 */
@Component({
  selector: 'app-searchable-select',
  templateUrl: './searchable-select.html',
  styleUrl: './searchable-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchableSelect {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly options = input.required<readonly SelectOption[]>();
  readonly value = model<string | number | null>(null);
  readonly placeholder = input('Elige una opción');
  readonly emptyText = input('Sin resultados');
  /** Lo que dice el campo cuando está abierto y vacío: invita a escribir para buscar. */
  readonly searchHint = input('Escribe para buscar…');
  /**
   * Deja usar lo que se escribió aunque no esté en la lista: aparece al final una opción «Usar "lo escrito"» y, al
   * elegirla, se avisa con `customChosen` (no cambia `value`). Para listas que son ayuda y no una frontera, como los
   * modelos de vehículo, donde siempre hay uno que el catálogo no trae.
   */
  readonly allowCustom = input(false);
  /** Lo que se muestra cuando no hay opción elegida pero sí un valor propio (el que se usó con `allowCustom`). */
  readonly customText = input('');
  readonly customChosen = output<string>();
  readonly disabled = input(false);
  readonly invalid = input(false);
  /** Para enlazar un `<label for>` con el campo. */
  readonly inputId = input<string | null>(null);

  readonly isOpen = signal(false);
  readonly query = signal('');
  readonly activeIndex = signal(0);

  readonly selected = computed(() => this.options().find((o) => o.value === this.value()) ?? null);
  readonly filtered = computed(() => filterOptions(this.options(), this.query()));
  /** Lo que muestra el campo: lo escrito mientras busca, y la opción elegida si no. */
  /** Lo escrito, si se puede usar tal cual: no está ya en la lista (sin distinguir acentos ni mayúsculas). */
  readonly customOption = computed(() => {
    const text = this.query().trim();
    if (!this.allowCustom() || !text) return null;
    const exact = this.options().some((o) => normalizeSearch(o.label) === normalizeSearch(text));
    return exact ? null : text;
  });
  readonly displayText = computed(() =>
    this.isOpen() ? this.query() : (this.selected()?.label ?? (this.value() === null ? this.customText() : '')),
  );
  readonly listId = computed(() => `${this.inputId() ?? 'ss'}-list`);

  /**
   * Solo en el teléfono (hoja inferior): cuánto sube la hoja para quedar justo encima del teclado y
   * cuánto puede medir. El teclado se pone encima de la página sin achicarla, y una hoja pegada al
   * borde de la ventana se queda detrás de él (con pocos resultados, entera). Fuera del teléfono
   * valen `null` y manda el SCSS.
   */
  readonly sheetInset = signal(0);
  readonly sheetMax = signal<number | null>(null);
  private stopKeyboardTracking: (() => void) | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.untrackKeyboard());
  }

  open(): void {
    if (this.disabled() || this.isOpen()) return;
    this.query.set('');
    const i = this.options().findIndex((o) => o.value === this.value());
    this.activeIndex.set(Math.max(i, 0));
    this.isOpen.set(true);
    this.trackKeyboard();
  }

  close(): void {
    this.isOpen.set(false);
    this.query.set('');
    this.untrackKeyboard();
  }

  private trackKeyboard(): void {
    if (this.stopKeyboardTracking) return;
    this.stopKeyboardTracking = trackKeyboard(640, ({ inset, free }) => {
      this.sheetInset.set(inset);
      this.sheetMax.set(Math.floor(Math.min(window.innerHeight * 0.55, free - 16)));
    });
  }

  private untrackKeyboard(): void {
    this.stopKeyboardTracking?.();
    this.stopKeyboardTracking = null;
    this.sheetInset.set(0);
    this.sheetMax.set(null);
  }

  onInput(text: string): void {
    this.isOpen.set(true);
    this.query.set(text);
    this.activeIndex.set(0);
  }

  choose(option: SelectOption): void {
    this.value.set(option.value);
    this.close();
  }

  chooseCustom(text: string): void {
    this.customChosen.emit(text);
    this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    const list = this.filtered();
    // La opción «Usar lo escrito» es una fila más, al final.
    const rows = list.length + (this.customOption() ? 1 : 0);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen()) this.open();
        else this.activeIndex.set(Math.min(this.activeIndex() + 1, rows - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.isOpen()) this.open();
        else this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
        break;
      case 'Enter':
        // Con la lista abierta Enter elige y no envía el formulario.
        if (this.isOpen()) {
          event.preventDefault();
          const option = list[this.activeIndex()];
          const custom = this.customOption();
          if (option) this.choose(option);
          else if (custom && this.activeIndex() === list.length) this.chooseCustom(custom);
        }
        break;
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onOutside(event: Event): void {
    if (this.isOpen() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
