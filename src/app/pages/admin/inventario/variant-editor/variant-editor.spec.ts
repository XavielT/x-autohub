import { TestBed } from '@angular/core/testing';
import { VariantEditor } from './variant-editor';
import { VariantDraft } from '../../../../../shared/models/admin-inventory.model';

const v = (name: string, stock = 1, over: Partial<VariantDraft> = {}): VariantDraft => ({
  id: null, name, sku: '', stock, isActive: true, ...over,
});

describe('VariantEditor', () => {
  function montar(inicial: VariantDraft[] = []) {
    const fixture = TestBed.createComponent(VariantEditor);
    fixture.componentRef.setInput('variants', inicial);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, c, el };
  }

  it('empieza vacío y lo dice: el producto se compra tal cual', () => {
    const { el } = montar();

    expect(el.textContent).toContain('Sin opciones');
  });

  it('agrega una opción con stock 0 y activa, y limpia el campo', () => {
    const { c } = montar();
    c.newName.set('  Negro ');

    c.add();

    expect(c.variants()).toEqual([{ id: null, name: 'Negro', sku: '', stock: 0, isActive: true }]);
    expect(c.newName()).toBe('');
    expect(c.error()).toBe('');
  });

  it('no agrega una sin nombre ni una repetida (sin importar mayúsculas)', () => {
    const { c } = montar([v('Negro')]);

    c.newName.set('  ');
    c.add();
    expect(c.error()).toContain('Escribe el nombre');

    c.newName.set('NEGRO');
    c.add();
    expect(c.error()).toBe('Ya hay una opción llamada "NEGRO".');
    expect(c.variants().length).toBe(1);
  });

  it('no agrega un nombre de más de 40 caracteres', () => {
    const { c } = montar();
    c.newName.set('x'.repeat(41));

    c.add();

    expect(c.error()).toContain('muy largo');
    expect(c.variants()).toEqual([]);
  });

  it('cambia el stock de una fila sin tocar las demás, y lo deja entero y de 0 o más', () => {
    const { c } = montar([v('A', 1), v('B', 2)]);

    c.setStock(1, '7.9');
    expect(c.variants().map((x) => x.stock)).toEqual([1, 7]);

    c.setStock(1, -4);
    c.setStock(0, '');
    expect(c.variants().map((x) => x.stock)).toEqual([0, 0]);
  });

  it('apagar una opción la deja en la lista pero fuera de la suma', () => {
    const { c } = montar([v('A', 3), v('B', 4)]);
    expect(c.total()).toBe(7);

    c.patch(1, { isActive: false });

    expect(c.total()).toBe(3);
    expect(c.variants().length).toBe(2);
  });

  it('sube y baja las filas, y no se sale de los extremos', () => {
    const { c } = montar([v('A'), v('B'), v('C')]);

    c.move(2, -1);
    expect(c.variants().map((x) => x.name)).toEqual(['A', 'C', 'B']);

    c.move(0, -1);
    c.move(2, 1);
    expect(c.variants().map((x) => x.name)).toEqual(['A', 'C', 'B']);
  });

  it('quitar saca solo esa fila', () => {
    const { c } = montar([v('A'), v('B')]);

    c.remove(0);

    expect(c.variants().map((x) => x.name)).toEqual(['B']);
  });

  it('pinta una fila por opción con sus campos, y la suma', () => {
    const { el } = montar([v('Negro', 3), v('Gris', 2)]);

    expect(el.querySelectorAll('.var__item').length).toBe(2);
    expect(el.querySelector('.var__total strong')?.textContent).toBe('5');
  });

  it('una fila apagada se ve apagada', () => {
    const { el } = montar([v('Negro', 3, { isActive: false })]);

    expect(el.querySelector('.var__item')?.classList.contains('var__item--off')).toBe(true);
  });
});
