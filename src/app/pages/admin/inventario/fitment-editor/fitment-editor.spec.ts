import { TestBed } from '@angular/core/testing';
import { FitmentEditor } from './fitment-editor';
import { VEHICLE_MAKES_MOCK, VEHICLE_MODELS_MOCK } from '../../../../../shared/data/vehicle.mock';

const toyota = VEHICLE_MAKES_MOCK.find((m) => m.slug === 'toyota')!;
const corolla = VEHICLE_MODELS_MOCK.find((m) => m.makeId === toyota.id && m.slug === 'corolla')!;

describe('FitmentEditor', () => {
  function montar() {
    const fixture = TestBed.createComponent(FitmentEditor);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;

    /** Escribe en los campos de agregar y deja que carguen los modelos de la marca. */
    const escribir = (make: string, modelo = '', desde: number | null = null, hasta: number | null = null) => {
      c.makeName.set(make);
      fixture.detectChanges(); // el efecto carga los modelos de la marca elegida
      c.modelName.set(modelo);
      c.yearFrom.set(desde);
      c.yearTo.set(hasta);
    };
    return { fixture, c, el, escribir };
  }

  it('empieza vacio y lo dice: sin compatibilidad la ficha pedira consultar', () => {
    const { el } = montar();
    expect(el.textContent).toContain('Consultar compatibilidad');
  });

  it('carga las 35 marcas para el autocompletado', () => {
    const { el } = montar();
    expect(el.querySelectorAll('#fit-makes option').length).toBe(35);
  });

  it('agrega marca, modelo y anos, sin distinguir mayusculas ni acentos', () => {
    const { c, escribir } = montar();
    escribir('TOYOTA', 'corolla', 2010, 2020);

    c.add();

    expect(c.fitments()).toEqual([{ makeId: toyota.id, modelId: corolla.id, yearFrom: 2010, yearTo: 2020 }]);
    expect(c.error()).toBe('');
  });

  it('limpia el modelo y los anos despues de agregar, para poder seguir con otro', () => {
    const { c, escribir } = montar();
    escribir('Toyota', 'Corolla', 2010, 2020);
    c.add();

    expect(c.modelName()).toBe('');
    expect(c.yearFrom()).toBeNull();
    expect(c.yearTo()).toBeNull();
    expect(c.makeName()).toBe('Toyota'); // la marca se queda: lo normal es agregar varios de la misma
  });

  it('sin modelo es toda la marca, y sin anos no tiene limite', () => {
    const { c, escribir } = montar();
    escribir('Toyota');
    c.add();

    expect(c.fitments()).toEqual([{ makeId: toyota.id, modelId: null, yearFrom: null, yearTo: null }]);
    expect(c.label(c.fitments()[0])).toBe('Toyota · todos los modelos · todos los años');
  });

  it('el rotulo dice el modelo y el rango, o desde / hasta si solo hay un extremo', () => {
    const { c, escribir } = montar();
    escribir('Toyota', 'Corolla', 2010, 2020);
    c.add();
    escribir('Toyota', 'Corolla', 2015, null);
    c.add();
    escribir('Toyota', 'Corolla', null, 2012);
    c.add();
    escribir('Toyota', 'Corolla', 2014, 2014);
    c.add();

    expect(c.fitments().map((f) => c.label(f))).toEqual([
      'Toyota · Corolla · 2010–2020',
      'Toyota · Corolla · desde 2015',
      'Toyota · Corolla · hasta 2012',
      'Toyota · Corolla · 2014',
    ]);
  });

  it('una marca que no existe no se agrega y manda a la pestana de marcas', () => {
    const { c, escribir } = montar();
    escribir('Marca Inventada');
    c.add();

    expect(c.fitments()).toEqual([]);
    expect(c.error()).toContain('Marcas y modelos');
  });

  it('un modelo que esa marca no tiene no se agrega', () => {
    const { c, escribir } = montar();
    escribir('Toyota', 'Civic');
    c.add();

    expect(c.fitments()).toEqual([]);
    expect(c.error()).toContain('no tiene ese modelo');
  });

  it('rechaza anos al reves o fuera de rango', () => {
    const { c, escribir } = montar();

    escribir('Toyota', '', 2020, 2010);
    c.add();
    expect(c.error()).toContain('no puede ser mayor');

    escribir('Toyota', '', 1800, null);
    c.add();
    expect(c.error()).toContain('entre 1900 y 2100');

    escribir('Toyota', '', null, 2500);
    c.add();
    expect(c.error()).toContain('entre 1900 y 2100');

    expect(c.fitments()).toEqual([]);
  });

  it('no agrega dos veces lo mismo', () => {
    const { c, escribir } = montar();
    escribir('Toyota', 'Corolla', 2010, 2020);
    c.add();
    escribir('Toyota', 'Corolla', 2010, 2020);
    c.add();

    expect(c.fitments().length).toBe(1);
    expect(c.error()).toContain('ya esta en la lista');
  });

  it('quita una fila', () => {
    const { c, escribir } = montar();
    escribir('Toyota');
    c.add();
    escribir('Honda');
    c.add();

    c.remove(0);

    expect(c.fitments().map((f) => f.makeId)).toEqual([VEHICLE_MAKES_MOCK.find((m) => m.slug === 'honda')!.id]);
  });

  it('lee los anos de un input numerico: vacio es nulo y basura tambien', () => {
    const { c } = montar();
    expect(c.parseYear('')).toBeNull();
    expect(c.parseYear(null)).toBeNull();
    expect(c.parseYear('abc')).toBeNull();
    expect(c.parseYear('2015')).toBe(2015);
    expect(c.parseYear(2015)).toBe(2015);
  });

  it('pinta las filas que ya traia, con el nombre del modelo y no un numero', () => {
    const fixture = TestBed.createComponent(FitmentEditor);
    fixture.componentInstance.fitments.set([
      { makeId: toyota.id, modelId: corolla.id, yearFrom: 2010, yearTo: 2020 },
    ]);
    fixture.detectChanges();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Toyota · Corolla · 2010–2020');
  });
});
