import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { MAX_SUGGESTIONS, SUGGESTION_DEBOUNCE_MS, SearchBox } from './search-box';
import { ProductService } from '../../services/product.service';
import { ProductModel, ProductSuggestion } from '../../models/product.model';
import { makeProduct } from '../../testing/product.fixture';
import { SupabaseService } from '../../../core/supabase/supabase.service';

describe('SearchBox', () => {
  const search = vi.fn<(query: string, limit?: number) => unknown>();

  const result = (items: ProductModel[]): ProductSuggestion[] => items;

  function montar(variant: 'navbar' | 'hero' = 'navbar') {
    TestBed.configureTestingModule({
      providers: [{ provide: ProductService, useValue: { suggestProducts: search } }],
    });
    const fixture = TestBed.createComponent(SearchBox);
    fixture.componentRef.setInput('variant', variant);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, navigate };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    search.mockReset();
    search.mockReturnValue(of(result([makeProduct({ id: 1, name: 'Disco', slug: 'disco' }), makeProduct({ id: 2, name: 'Discoteca', slug: 'discoteca' })])));
  });

  afterEach(() => vi.useRealTimers());

  it('espera 250 ms desde la última tecla antes de pedir sugerencias', () => {
    const { c } = montar();

    c.onInput('dis');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS - 1);
    expect(search).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('dis', MAX_SUGGESTIONS);
  });

  it('seguir escribiendo reinicia la espera: tres teclas rapidas, una sola consulta', () => {
    const { c } = montar();

    c.onInput('d');
    vi.advanceTimersByTime(100);
    c.onInput('di');
    vi.advanceTimersByTime(100);
    c.onInput('dis');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('dis', MAX_SUGGESTIONS);
  });

  it('si una sugerencia coincidió por un alias, lo dice ("también: …")', () => {
    const { c, el, fixture } = montar();
    search.mockReturnValueOnce(of([{ ...makeProduct({ id: 5, name: 'Parachoques GTR', slug: 'parachoques-gtr' }), matchedAlias: 'bumper' }]));

    c.onInput('bump');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    fixture.detectChanges();

    expect(el.querySelector('.sb__alias')?.textContent?.trim()).toBe('también: bumper');
  });

  it('sin alias no pinta la línea "también"', () => {
    const { c, el, fixture } = montar();

    c.onInput('dis');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    fixture.detectChanges();

    expect(el.querySelector('.sb__alias')).toBeNull();
  });

  it('pide como maximo 6 sugerencias', () => {
    expect(MAX_SUGGESTIONS).toBe(6);
  });

  it('con menos de 2 letras no pide nada y vacia lo que habia al instante', () => {
    const { c } = montar();
    c.onInput('dis');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    expect(c.suggestions().length).toBe(2);

    c.onInput('d');
    // Sin esperar los 300 ms: dejar sugerencias viejas a la vista se ve roto.
    expect(c.suggestions()).toEqual([]);
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('no repite la consulta si el texto no cambio', () => {
    const { c } = montar();
    c.onInput('dis');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    c.onInput('dis ');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);

    expect(search).toHaveBeenCalledTimes(1);
  });

  it('una respuesta vieja no pisa a la nueva (switchMap)', () => {
    const lenta = new Subject<ProductSuggestion[]>();
    search.mockReturnValueOnce(lenta);
    search.mockReturnValueOnce(of(result([makeProduct({ id: 9, name: 'Nuevo' })])));
    const { c } = montar();

    c.onInput('vie');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    c.onInput('nue');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    expect(c.suggestions().map((p) => p.id)).toEqual([9]);

    lenta.next(result([makeProduct({ id: 1, name: 'Viejo' })]));
    expect(c.suggestions().map((p) => p.id)).toEqual([9]);
  });

  it('si la búsqueda falla no rompe: sin sugerencias, y el Enter sigue funcionando', () => {
    search.mockReturnValue(throwError(() => new Error('sin red')));
    const { c, navigate } = montar();

    c.onInput('dis');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    expect(c.suggestions()).toEqual([]);

    c.submit();
    expect(navigate).toHaveBeenCalledWith(['/buscar'], { queryParams: { q: 'dis' } });
  });

  it('Enter sin sugerencia resaltada lleva a /buscar?q=', () => {
    const { c, navigate } = montar();
    c.onInput('  disco  ');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);

    c.submit();

    expect(navigate).toHaveBeenCalledWith(['/buscar'], { queryParams: { q: 'disco' } });
    expect(c.isOpen()).toBe(false);
  });

  it('Enter con el campo vacío no navega', () => {
    const { c, navigate } = montar();
    c.onInput('   ');
    c.submit();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('las flechas recorren las sugerencias y Enter abre la resaltada', () => {
    const { c, navigate } = montar();
    c.onInput('dis');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    const key = (k: string) => c.onKeydown(new KeyboardEvent('keydown', { key: k }));

    key('ArrowDown');
    expect(c.activeIndex()).toBe(0);
    key('ArrowDown');
    expect(c.activeIndex()).toBe(1);
    key('ArrowDown'); // da la vuelta
    expect(c.activeIndex()).toBe(0);
    key('ArrowUp'); // y hacia arriba tambien
    expect(c.activeIndex()).toBe(1);

    c.submit();
    expect(navigate).toHaveBeenCalledWith(['/tienda', 'p', 'discoteca']);
  });

  it('"Ver todos los resultados" va a la lista aunque haya algo resaltado', () => {
    const { c, navigate } = montar();
    c.onInput('dis');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    c.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    c.seeAll();

    expect(navigate).toHaveBeenCalledWith(['/buscar'], { queryParams: { q: 'dis' } });
  });

  it('Escape cierra la lista', () => {
    const { c } = montar();
    c.onInput('dis');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    expect(c.isOpen()).toBe(true);

    c.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(c.isOpen()).toBe(false);
  });

  it('un clic fuera la cierra; uno dentro no', () => {
    const { c, el } = montar();
    c.onInput('dis');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);

    c.onDocumentClick({ target: el.querySelector('input') } as unknown as Event);
    expect(c.isOpen()).toBe(true);

    c.onDocumentClick({ target: document.body } as unknown as Event);
    expect(c.isOpen()).toBe(false);
  });

  it('elegir una sugerencia lleva a su ficha y limpia el campo', () => {
    const { c, navigate } = montar();
    c.onInput('dis');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);

    c.open(c.suggestions()[0]);

    expect(navigate).toHaveBeenCalledWith(['/tienda', 'p', 'disco']);
    expect(c.query()).toBe('');
    expect(c.suggestions()).toEqual([]);
  });

  it('pinta cada sugerencia con nombre, marca y precio en RD$, y el enlace a todos', () => {
    const { fixture, c, el } = montar();
    c.onInput('dis');
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    fixture.detectChanges();

    expect(el.querySelectorAll('.sb__option').length).toBe(2);
    expect(el.textContent).toContain('RD$ 1,000');
    expect(el.querySelector('.sb__all-btn')).not.toBeNull();
    expect(el.querySelector('input')?.getAttribute('role')).toBe('combobox');
  });

  it('la variante grande lleva la clase del home', () => {
    const { el } = montar('hero');
    expect(el.querySelector('.sb--hero')).not.toBeNull();
  });

  it('el submit del formulario no recarga la página', () => {
    const { c } = montar();
    const event = new Event('submit', { cancelable: true });

    c.onSubmit(event);

    expect(event.defaultPrevented).toBe(true);
  });

  describe('estados de carga', () => {
    it('mientras la petición está en vuelo: spinner, "Buscando…" y el botón apagado', () => {
      const pending = new Subject<ProductSuggestion[]>();
      search.mockReturnValue(pending);
      const { fixture, c, el } = montar();

      c.onInput('liqui');
      c.isOpen.set(true);
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
      fixture.detectChanges();

      expect(c.isSearching()).toBe(true);
      expect(el.querySelector('.sb__spinner')).not.toBeNull();
      expect(el.querySelector('.sb__status')?.textContent).toContain('Buscando…');
      expect(el.querySelector<HTMLButtonElement>('.sb__submit')?.disabled).toBe(true);

      pending.next(result([makeProduct({ id: 9, name: 'Liquido', slug: 'liquido' })]));
      fixture.detectChanges();
      expect(c.isSearching()).toBe(false);
      expect(el.querySelector('.sb__spinner')).toBeNull();
      expect(el.querySelector<HTMLButtonElement>('.sb__submit')?.disabled).toBe(false);
    });

    it('sin coincidencias dice "Sin resultados para «liqui»"', () => {
      search.mockReturnValue(of(result([])));
      const { fixture, c, el } = montar();

      c.onInput('liqui');
      c.isOpen.set(true);
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
      fixture.detectChanges();

      expect(el.querySelector('.sb__status')?.textContent).toContain('Sin resultados para «liqui»');
    });

    it('un prefijo ya buscado sale del caché y no vuelve a la red', () => {
      const { c } = montar();

      c.onInput('dis');
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
      c.onInput('disc');
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
      expect(search).toHaveBeenCalledTimes(2);

      c.onInput('dis');
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
      expect(search).toHaveBeenCalledTimes(2);
      expect(c.suggestions().length).toBe(2);
    });

    it('seguir escribiendo cancela la petición anterior', () => {
      const first = new Subject<ProductSuggestion[]>();
      const second = new Subject<ProductSuggestion[]>();
      search.mockReturnValueOnce(first).mockReturnValueOnce(second);
      const { c } = montar();

      c.onInput('dis');
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
      c.onInput('disc');
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);

      expect(first.observed).toBe(false); // switchMap se desuscribió: se aborta también en el cliente
      expect(second.observed).toBe(true);
    });

    it('enfocar el campo pide el módulo de supabase-js una sola vez', () => {
      const { c } = montar();
      const client = vi.spyOn(TestBed.inject(SupabaseService), 'client');

      c.onFocus();
      c.onFocus();

      expect(client).toHaveBeenCalledTimes(1);
    });
  });
});
