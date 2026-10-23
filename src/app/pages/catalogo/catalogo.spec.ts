import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { Catalogo } from './catalogo';

describe('Catalogo (hoy /tienda y /buscar)', () => {
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function montar(query: Record<string, string> = {}) {
    params = new BehaviorSubject(convertToParamMap(query));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: params.asObservable(), snapshot: { queryParamMap: params.value } },
        },
      ],
    });
    const fixture = TestBed.createComponent(Catalogo);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const names = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.hub-part-card__name')).map((n) => n.textContent?.trim());

  it('se crea y muestra las piezas visibles', async () => {
    const { c } = await montar();
    expect(c.filteredParts().length).toBe(35);
  });

  it('el texto de /buscar?q= filtra por nombre o marca', async () => {
    const { fixture, c, el } = await montar({ q: 'bremb' });

    expect(c.searchQuery()).toBe('bremb');
    fixture.detectChanges();
    expect(names(el)).toEqual(['Disco ventilado GTR 355mm']);
  });

  it('escucha los parametros: ir de una busqueda a otra reutiliza la pagina y se pone al dia', async () => {
    const { fixture, c, el } = await montar({ q: 'bremb' });

    params.next(convertToParamMap({ q: 'k&n' }));
    fixture.detectChanges();

    expect(c.searchQuery()).toBe('k&n');
    expect(names(el)).toEqual(['Filtro de aire de alto flujo']);

    // Y si la URL se queda sin q, el campo se vacia.
    params.next(convertToParamMap({}));
    expect(c.searchQuery()).toBe('');
  });

  it('?categoria= filtra por la categoria nueva, incluidas sus hijas, y muestra la chip', async () => {
    const { fixture, c, el } = await montar({ categoria: 'frenos' });
    fixture.detectChanges();

    expect(c.categorySlug()).toBe('frenos');
    expect(c.activeCategoryName()).toBe('Frenos');
    expect(c.filteredParts().map((p) => p.id).sort((a, b) => a - b)).toEqual([1, 11, 12]);
    expect(el.querySelector('.catalogo__active-filter')?.textContent).toContain('Frenos');
  });

  it('una categoria que no existe no muestra nada, en vez de todo', async () => {
    const { c } = await montar({ categoria: 'no-existe' });
    expect(c.filteredParts()).toEqual([]);
  });

  it('?category= (la de texto de antes) sigue funcionando: los enlaces viejos no se rompen', async () => {
    const { c } = await montar({ category: 'motor' });

    expect(c.selectedCategory()).toBe('motor');
    expect(c.filteredParts().every((p) => p.category === 'motor')).toBe(true);
    expect(c.filteredParts().length).toBe(3);
  });

  it('una categoria de texto inventada se ignora', async () => {
    const { c } = await montar({ category: 'inventada' });
    expect(c.selectedCategory()).toBe('');
    expect(c.filteredParts().length).toBe(35);
  });

  it('quitar el filtro de categoria deja el resto de la URL como esta', async () => {
    const { c } = await montar({ categoria: 'frenos', q: 'disco' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    c.clearCategorySlug();

    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { categoria: null },
      queryParamsHandling: 'merge',
    });
  });

  it('el enlace de ayuda usa el WhatsApp de la tienda (antes llevaba otro numero)', async () => {
    const { c, el } = await montar();
    const link = el.querySelector('.catalogo__help-link') as HTMLAnchorElement;

    expect(c.whatsappHelpLink).toContain('wa.me/18099539782');
    expect(link.href).toContain('wa.me/18099539782');
    expect(link.href).not.toContain('7799782');
    expect(link.textContent).toContain('809-953-9782');
  });

  it('el titulo de la pagina es Tienda', async () => {
    const { el } = await montar();
    expect(el.querySelector('.catalogo__title h2')?.textContent).toContain('Tienda');
  });
});
