import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

export interface SelectOption<T extends string | number = string | number> {
  value: T;
  label: string;
}

/** Minúsculas y sin acentos, para que "citroen" encuentre "Citroën". */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Las opciones cuyo texto contiene lo escrito, sin distinguir acentos ni mayúsculas. */
export function filterOptions<T extends string | number>(
  options: readonly SelectOption<T>[],
  query: string,
): SelectOption<T>[] {
  const q = normalizeSearch(query);
  if (!q) return [...options];
  return options.filter((o) => normalizeSearch(o.label).includes(q));
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

  readonly options = input.required<readonly SelectOption[]>();
  readonly value = model<string | number | null>(null);
  readonly placeholder = input('Elige una opción');
  readonly emptyText = input('Sin resultados');
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
  readonly displayText = computed(() => (this.isOpen() ? this.query() : (this.selected()?.label ?? '')));
  readonly listId = computed(() => `${this.inputId() ?? 'ss'}-list`);

  open(): void {
    if (this.disabled() || this.isOpen()) return;
    this.query.set('');
    const i = this.options().findIndex((o) => o.value === this.value());
    this.activeIndex.set(Math.max(i, 0));
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.query.set('');
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

  onKeydown(event: KeyboardEvent): void {
    const list = this.filtered();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen()) this.open();
        else this.activeIndex.set(Math.min(this.activeIndex() + 1, list.length - 1));
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
          if (option) this.choose(option);
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
