import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { AdminBusqueda } from './admin-busqueda';
import { AdminSearchService } from '../../../../shared/services/admin-search.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { DEFAULT_SEARCH_SYNONYMS } from '../../../../shared/utils/search-synonyms';

describe('AdminBusqueda (/admin/busqueda)', () => {
  const toast = { show: vi.fn() };
  const input = (value: string) => ({ target: { value } }) as unknown as Event;

  beforeEach(() => {
    localStorage.clear();
    toast.show.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: ToastService, useValue: toast },
        { provide: AuthService, useValue: { user: signal(null) } },
      ],
    });
  });

  async function montar() {
    const fixture = TestBed.createComponent(AdminBusqueda);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('lista la siembra de sinónimos y las búsquedas sin resultado', async () => {
    const { c, el } = await montar();

    expect(c.groups()).toHaveLength(DEFAULT_SEARCH_SYNONYMS.length);
    const text = el.textContent ?? '';
    expect(text).toContain('bumper');
    expect(text).toContain('Buscaron y no encontraron');
    expect(text).toContain('espejo retrovisor');
  });

  it('filtra los grupos por cualquiera de sus términos, sin tildes', async () => {
    const { c } = await montar();

    c.setFilter(input('Neumático'));

    expect(c.shown()).toHaveLength(1);
    expect(c.shown()[0].terms).toContain('goma');
  });

  it('agrega un grupo nuevo al principio, normalizado, y limpia el formulario', async () => {
    const { c } = await montar();

    c.setNewTerms(input('  Cañón , CANON, zzcanon2'));
    c.addGroup();

    expect(c.groups()[0].terms).toEqual(['canon', 'zzcanon2']);
    expect(c.newTerms()).toBe('');
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('Sinónimos guardados'));
  });

  it('un grupo de un solo término muestra el error y no se guarda', async () => {
    const { c } = await montar();
    const antes = c.groups().length;

    c.setNewTerms(input('solo'));
    c.addGroup();

    expect(c.newError()).toContain('al menos dos');
    expect(c.groups()).toHaveLength(antes);
  });

  it('"Hacer sinónimo" pasa la búsqueda perdida al formulario', async () => {
    const { c } = await montar();

    c.startFromGap({ query: 'cornetas', searches: 2, lastSeen: new Date() });

    expect(c.newTerms()).toBe('cornetas, ');
  });

  it('agrega un término a un grupo y lo quita; con dos términos no deja quitar', async () => {
    const { c } = await montar();
    const grupo = c.groups().find((g) => g.terms.includes('termostato'))!;

    c.setExtra(grupo.id, input('Thermo Stat'));
    c.addTerm(grupo);
    expect(c.groups().find((g) => g.id === grupo.id)!.terms).toContain('thermo stat');

    const actual = () => c.groups().find((g) => g.id === grupo.id)!;
    c.removeTerm(actual(), 'thermo stat');
    expect(actual().terms).toEqual(['termostato', 'thermostat']);

    c.removeTerm(actual(), 'thermostat');
    expect(actual().terms).toEqual(['termostato', 'thermostat']);
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('al menos dos'), 'error');
  });

  it('borrar un grupo pide confirmar con un segundo toque', async () => {
    const { c } = await montar();
    const grupo = c.groups()[0];
    const antes = c.groups().length;

    c.removeGroup(grupo);
    expect(c.confirmingId()).toBe(grupo.id);
    expect(c.groups()).toHaveLength(antes);

    c.removeGroup(grupo);
    expect(c.groups()).toHaveLength(antes - 1);
    expect(c.confirmingId()).toBeNull();
  });

  it('probar una búsqueda usa el buscador de la tienda y entiende un sinónimo', async () => {
    const { fixture, c } = await montar();

    c.runTest('balata');
    await fixture.whenStable();

    expect(c.testResults()!.map((p) => p.name)).toContain('Pastillas cerámicas Sport');
  });

  it('una prueba de menos de 2 letras no busca', async () => {
    const { c } = await montar();

    c.runTest('a');

    expect(c.testResults()).toBeNull();
  });
});

describe('AdminSearchService', () => {
  it('los errores de validación llegan como Error con el mensaje en español', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(AdminSearchService);
    let message = '';

    service.addSynonyms(['uno']).subscribe({ error: (e: Error) => (message = e.message) });

    expect(message).toContain('al menos dos');
  });
});
