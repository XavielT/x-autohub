import { TestBed } from '@angular/core/testing';
import { AliasEditor } from './alias-editor';

describe('AliasEditor', () => {
  function montar(productId: number | null) {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(AliasEditor);
    fixture.componentRef.setInput('productId', productId);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('sin producto guardado no deja agregar y lo explica', () => {
    const { el } = montar(null);
    expect(el.textContent).toContain('Guarda el producto primero');
    expect(el.querySelector('input')).toBeNull();
  });

  it('agrega, rechaza el repetido y quita', async () => {
    const { fixture, c } = montar(2);

    c.text.set('bumper');
    c.add();
    await fixture.whenStable();
    expect(c.aliases().map((a) => a.alias)).toEqual(['bumper']);
    expect(c.text()).toBe('');

    c.text.set('Bumper');
    c.add();
    await fixture.whenStable();
    expect(c.error()).toBe('Ese alias ya está en la lista.');
    expect(c.aliases()).toHaveLength(1);

    c.remove(c.aliases()[0]);
    await fixture.whenStable();
    expect(c.aliases()).toEqual([]);
  });

  it('un alias vacío o de una letra no se manda', () => {
    const { c } = montar(2);
    c.add();
    expect(c.error()).toBe('Escribe el alias.');
    c.text.set('a');
    c.add();
    expect(c.error()).toBe('El alias debe tener entre 2 y 60 letras.');
  });
});
