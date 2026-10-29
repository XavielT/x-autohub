import { TestBed } from '@angular/core/testing';
import { AdminCategorias } from './admin-categorias';
import { ToastService } from '../../../../../shared/services/toast.service';

describe('AdminCategorias', () => {
  const show = vi.fn();

  function montar() {
    show.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: { show } }] });
    const fixture = TestBed.createComponent(AdminCategorias);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const nombres = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLInputElement>('.cat__name')).map((i) => i.value);

  it('lista las 12 categorías de primer nivel, en orden', () => {
    const { el } = montar();
    const lista = nombres(el);

    expect(lista.length).toBe(12);
    expect(lista[0]).toBe('Accesorios interior');
    expect(lista[11]).toBe('Herramientas y emergencia');
  });

  it('agrega una subcategoría dentro de una de primer nivel y la muestra colgada', () => {
    const { fixture, c, el } = montar();
    const frenos = c.categories().find((x) => x.slug === 'frenos')!;
    c.newName.set('Discos y pastillas');
    c.newParentId.set(frenos.id);

    c.add();
    fixture.detectChanges();

    expect(nombres(el)).toContain('Discos y pastillas');
    expect(el.querySelectorAll('.cat__children .cat__node--child').length).toBe(1);
    expect(c.newName()).toBe('');
    expect(show).toHaveBeenCalledWith('"Discos y pastillas" agregada.');
  });

  it('la nueva queda al final de sus hermanas', () => {
    const { c } = montar();
    c.newName.set('Última');
    c.add();

    const ultima = c.categories().find((x) => x.slug === 'ultima')!;
    const mayor = Math.max(...c.categories().filter((x) => x.parentId === null).map((x) => x.sortOrder));
    expect(ultima.sortOrder).toBe(mayor);
    expect(ultima.sortOrder).toBe(130);
  });

  it('no agrega sin nombre', () => {
    const { c } = montar();
    c.add();

    expect(c.categories().length).toBe(12);
    expect(show).toHaveBeenCalledWith('Escribe el nombre de la categoría.', 'error');
  });

  it('un nombre repetido da el error de la base, sin duplicar', () => {
    const { c } = montar();
    c.newName.set('Frenos');
    c.add();

    expect(c.categories().length).toBe(12);
    expect(show).toHaveBeenCalledWith('Ese registro ya existe.', 'error');
  });

  it('renombra al salir del campo, y un nombre vacío se revierte', () => {
    const { fixture, c, el } = montar();
    const frenos = c.categories().find((x) => x.slug === 'frenos')!;
    const input = Array.from(el.querySelectorAll<HTMLInputElement>('.cat__name')).find((i) => i.value === 'Frenos')!;

    input.value = 'Frenos y discos';
    c.rename(frenos, { target: input } as unknown as Event);
    fixture.detectChanges();
    expect(c.categories().find((x) => x.id === frenos.id)?.name).toBe('Frenos y discos');

    input.value = '   ';
    c.rename({ ...frenos, name: 'Frenos y discos' }, { target: input } as unknown as Event);
    expect(input.value).toBe('Frenos y discos');
    expect(show).toHaveBeenCalledWith('El nombre no puede quedar vacío.', 'error');
  });

  it('oculta y vuelve a mostrar una categoría', () => {
    const { c } = montar();
    const frenos = c.categories().find((x) => x.slug === 'frenos')!;

    c.toggleActive(frenos);
    expect(c.categories().find((x) => x.id === frenos.id)?.isActive).toBe(false);

    c.toggleActive(c.categories().find((x) => x.id === frenos.id)!);
    expect(c.categories().find((x) => x.id === frenos.id)?.isActive).toBe(true);
  });

  it('sube y baja entre hermanas, y la primera no sube ni la última baja', () => {
    const { c, fixture, el } = montar();
    const primera = c.categories().find((x) => x.slug === 'accesorios-interior')!;

    c.move(primera, 1);
    fixture.detectChanges();
    expect(nombres(el).slice(0, 2)).toEqual(['Accesorios exterior', 'Accesorios interior']);

    const nuevaPrimera = c.categories().find((x) => x.slug === 'accesorios-exterior')!;
    c.move(nuevaPrimera, -1); // ya es la primera: no hace nada
    fixture.detectChanges();
    expect(nombres(el).slice(0, 2)).toEqual(['Accesorios exterior', 'Accesorios interior']);

    const botones = el.querySelectorAll<HTMLButtonElement>('.cat__tools .cat__btn');
    expect(botones[0].disabled).toBe(true); // subir, en la primera
  });
});
