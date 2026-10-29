import { TestBed } from '@angular/core/testing';
import { SpecsEditor } from './specs-editor';

describe('SpecsEditor', () => {
  function montar(inicial: Record<string, string> = {}) {
    const fixture = TestBed.createComponent(SpecsEditor);
    fixture.componentInstance.specs.set(inicial);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('agrega un par y limpia los campos', () => {
    const { c } = montar();
    c.key.set('  Material ');
    c.value.set(' Aluminio ');

    c.add();

    expect(c.specs()).toEqual({ Material: 'Aluminio' });
    expect(c.key()).toBe('');
    expect(c.value()).toBe('');
    expect(c.error()).toBe('');
  });

  it('exige nombre y valor', () => {
    const { c } = montar();

    c.key.set('Material');
    c.add();
    expect(c.error()).toBe('Escribe el nombre y el valor.');

    c.key.set('');
    c.value.set('Aluminio');
    c.add();
    expect(c.error()).toBe('Escribe el nombre y el valor.');

    c.key.set('   ');
    c.value.set('   ');
    c.add();
    expect(c.specs()).toEqual({});
  });

  it('no repite un nombre: hay que quitarlo para cambiarlo', () => {
    const { c } = montar({ Material: 'Aluminio' });
    c.key.set('Material');
    c.value.set('Acero');

    c.add();

    expect(c.specs()).toEqual({ Material: 'Aluminio' });
    expect(c.error()).toContain('ya está en la lista');
  });

  it('quita un par sin tocar los demas', () => {
    const { c } = montar({ Material: 'Aluminio', Medida: '18x8.5' });

    c.remove('Material');

    expect(c.specs()).toEqual({ Medida: '18x8.5' });
  });

  it('pinta cada par y un boton para quitarlo', () => {
    const { el } = montar({ Material: 'Aluminio', Medida: '18x8.5' });

    expect(el.querySelectorAll('.spec__item').length).toBe(2);
    expect(el.textContent).toContain('Material:');
    expect(el.textContent).toContain('18x8.5');
    expect(el.querySelector('[aria-label="Quitar Material"]')).not.toBeNull();
  });
});
