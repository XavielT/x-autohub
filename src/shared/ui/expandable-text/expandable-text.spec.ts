import { TestBed } from '@angular/core/testing';

import { ExpandableText } from './expandable-text';

describe('ExpandableText', () => {
  function montar(text: string, maxLength?: number) {
    const fixture = TestBed.createComponent(ExpandableText);
    fixture.componentRef.setInput('text', text);
    if (maxLength) fixture.componentRef.setInput('maxLength', maxLength);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, texto: () => el.querySelector('p')!.textContent, boton: () => el.querySelector('button') };
  }

  it('un texto corto se ve completo y sin boton', () => {
    const { texto, boton } = montar('Corto.');
    expect(texto()).toBe('Corto.');
    expect(boton()).toBeNull();
  });

  it('un texto largo se recorta con puntos suspensivos y se expande y contrae', () => {
    const { fixture, texto, boton } = montar('a'.repeat(30), 10);
    expect(texto()).toBe('a'.repeat(10) + '...');
    expect(boton()!.textContent).toContain('Ver más');

    boton()!.click();
    fixture.detectChanges();
    expect(texto()).toBe('a'.repeat(30));
    expect(boton()!.textContent).toContain('Ver menos');
    expect(boton()!.getAttribute('aria-expanded')).toBe('true');

    boton()!.click();
    fixture.detectChanges();
    expect(texto()).toBe('a'.repeat(10) + '...');
  });

  it('un texto del largo exacto no se recorta', () => {
    const { texto, boton } = montar('a'.repeat(10), 10);
    expect(texto()).toBe('a'.repeat(10));
    expect(boton()).toBeNull();
  });
});
