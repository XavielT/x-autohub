import { TestBed } from '@angular/core/testing';
import { SearchableSelect, SelectOption, filterOptions, normalizeSearch } from './searchable-select';

const OPTIONS: SelectOption[] = [
  { value: 1, label: 'Citroën' },
  { value: 2, label: 'Toyota' },
  { value: 3, label: 'Honda' },
];

describe('SearchableSelect', () => {
  function montar(value: number | null = null) {
    const fixture = TestBed.createComponent(SearchableSelect);
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input')!;
    const labels = () => Array.from(el.querySelectorAll('[role=option]')).map((o) => o.textContent?.trim());
    const type = (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const key = (k: string) => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
      fixture.detectChanges();
    };
    return { fixture, c: fixture.componentInstance, el, input, labels, type, key };
  }

  describe('hoja inferior en el teléfono', () => {
    const realViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const realMatchMedia = window.matchMedia;

    afterEach(() => {
      if (realViewport) Object.defineProperty(window, 'visualViewport', realViewport);
      else delete (window as unknown as Record<string, unknown>)['visualViewport'];
      window.matchMedia = realMatchMedia;
    });

    function simular(movil: boolean, alto: number) {
      const vv = new EventTarget() as EventTarget & { height: number; offsetTop: number };
      vv.height = alto;
      vv.offsetTop = 0;
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
      window.matchMedia = ((q: string) => ({ matches: movil, media: q }) as MediaQueryList) as typeof window.matchMedia;
      return vv;
    }

    it('sube la hoja por encima del teclado y la sigue si el teclado cambia', () => {
      const vv = simular(true, window.innerHeight - 300); // el teclado ocupa 300px
      const { fixture, c, el } = montar();
      c.open();
      fixture.detectChanges();

      const lista = el.querySelector<HTMLElement>('.ss__list')!;
      expect(c.sheetInset()).toBe(300);
      expect(lista.style.bottom).toBe('300px');
      expect(c.sheetMax()).toBeLessThanOrEqual(window.innerHeight - 300 - 16);

      vv.height = window.innerHeight; // se cierra el teclado
      vv.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      expect(c.sheetInset()).toBe(0);
    });

    it('fuera del teléfono no toca la posición de la lista', () => {
      simular(false, window.innerHeight - 300);
      const { fixture, c, el } = montar();
      c.open();
      fixture.detectChanges();

      expect(c.sheetInset()).toBe(0);
      expect(c.sheetMax()).toBeNull();
      expect(el.querySelector<HTMLElement>('.ss__list')!.style.bottom).toBe('');
    });

    it('al cerrar deja de escuchar y vuelve a cero', () => {
      simular(true, window.innerHeight - 300);
      const { fixture, c } = montar();
      c.open();
      c.close();
      fixture.detectChanges();

      expect(c.sheetInset()).toBe(0);
      expect(c.sheetMax()).toBeNull();
    });
  });

  it('normaliza acentos y mayúsculas', () => {
    expect(normalizeSearch('  Citroën ')).toBe('citroen');
    expect(filterOptions(OPTIONS, 'CITROEN').map((o) => o.value)).toEqual([1]);
    expect(filterOptions(OPTIONS, '').length).toBe(3);
  });

  it('busca por cualquier parte del texto y por varias palabras en cualquier orden', () => {
    const modelos: SelectOption[] = [
      { value: 1, label: 'Corolla' },
      { value: 2, label: 'Land Cruiser' },
      { value: 3, label: 'Civic' },
      { value: 4, label: 'Santa Fe' },
    ];
    expect(filterOptions(modelos, 'roll').map((o) => o.value)).toEqual([1]);
    expect(filterOptions(modelos, 'land cr').map((o) => o.value)).toEqual([2]);
    expect(filterOptions(modelos, 'cruiser land').map((o) => o.value)).toEqual([2]);
    expect(filterOptions(modelos, 'fe santa').map((o) => o.value)).toEqual([4]);
    expect(filterOptions(modelos, 'zzz')).toEqual([]);
  });

  it('pone primero lo que empieza con lo escrito, luego lo que tiene una palabra que empieza así, y al final lo que solo lo contiene', () => {
    const marcas: SelectOption[] = [
      { value: 1, label: 'Mitsubishi Montero' },
      { value: 2, label: 'Toyota Tercel' },
      { value: 3, label: 'Terios' },
      { value: 4, label: 'Subaru Forester' },
    ];
    // "ter": Terios empieza así; Toyota Tercel tiene una palabra que empieza así; Montero y Forester solo lo contienen.
    expect(filterOptions(marcas, 'ter').map((o) => o.value)).toEqual([3, 2, 1, 4]);
  });

  it('con igual cercanía conserva el orden de la lista', () => {
    const lista: SelectOption[] = [
      { value: 1, label: 'Ford' },
      { value: 2, label: 'Fiat' },
      { value: 3, label: 'Fisker' },
    ];
    expect(filterOptions(lista, 'f').map((o) => o.value)).toEqual([1, 2, 3]);
  });

  it('abierto y vacío invita a escribir para buscar', () => {
    const { fixture, c, input } = montar();
    expect(input.placeholder).toBe('Elige una opción');

    c.open();
    fixture.detectChanges();
    expect(input.placeholder).toBe('Escribe para buscar…');

    c.close();
    fixture.detectChanges();
    expect(input.placeholder).toBe('Elige una opción');
  });

  it('al escribir "citroen" encuentra "Citroën"', () => {
    const { type, labels } = montar();
    type('citroen');
    expect(labels()).toEqual(['Citroën']);
  });

  it('sin coincidencias dice "Sin resultados"', () => {
    const { type, el } = montar();
    type('zzz');
    expect(el.querySelector('.ss__empty')?.textContent).toContain('Sin resultados');
  });

  it('flechas y Enter eligen la opción', () => {
    const { c, key, labels, input } = montar();
    input.dispatchEvent(new Event('focus'));
    key('ArrowDown');
    key('ArrowDown');
    expect(labels().length).toBe(3);
    key('Enter');
    expect(c.value()).toBe(3);
    expect(c.isOpen()).toBe(false);
  });

  it('Escape cierra sin elegir', () => {
    const { c, key, input } = montar();
    input.dispatchEvent(new Event('focus'));
    expect(c.isOpen()).toBe(true);
    key('Escape');
    expect(c.isOpen()).toBe(false);
    expect(c.value()).toBeNull();
  });

  it('Tab cierra la lista', () => {
    const { c, key, input } = montar();
    input.dispatchEvent(new Event('focus'));
    key('Tab');
    expect(c.isOpen()).toBe(false);
  });

  it('muestra la etiqueta de la opción elegida', () => {
    const { input } = montar(2);
    expect(input.value).toBe('Toyota');
  });

  it('un clic en una opción la elige', () => {
    const { c, el, input, fixture } = montar();
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    el.querySelectorAll<HTMLElement>('[role=option]')[1].click();
    expect(c.value()).toBe(2);
  });

  it('desactivado no se abre', () => {
    const fixture = TestBed.createComponent(SearchableSelect);
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    fixture.componentInstance.open();
    expect(fixture.componentInstance.isOpen()).toBe(false);
  });
});
