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

  it('normaliza acentos y mayúsculas', () => {
    expect(normalizeSearch('  Citroën ')).toBe('citroen');
    expect(filterOptions(OPTIONS, 'CITROEN').map((o) => o.value)).toEqual([1]);
    expect(filterOptions(OPTIONS, '').length).toBe(3);
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
