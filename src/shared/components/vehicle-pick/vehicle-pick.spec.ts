import { TestBed } from '@angular/core/testing';

import { VehiclePick } from './vehicle-pick';
import { VehicleSelection } from '../../models/business-document.model';
import { VEHICLE_MAKES_MOCK, VEHICLE_MODELS_MOCK } from '../../data/vehicle.mock';

describe('VehiclePick', () => {
  const toyota = VEHICLE_MAKES_MOCK.find((m) => m.slug === 'toyota')!;
  const corolla = VEHICLE_MODELS_MOCK.find((m) => m.makeId === toyota.id && m.slug === 'corolla')!;

  function montar(value: Partial<VehicleSelection> | null = null) {
    const fixture = TestBed.createComponent(VehiclePick);
    fixture.componentRef.setInput('value', value);
    const emitted: VehicleSelection[] = [];
    fixture.componentInstance.changed.subscribe((e) => emitted.push(e));
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, emitted };
  }

  it('ofrece las marcas del catálogo y avisa el texto armado marca → modelo → año', () => {
    const { c, emitted } = montar();
    expect(c.makeOptions().length).toBeGreaterThan(5);

    c.onMakeChange(toyota.id);
    expect(emitted.at(-1)?.text).toBe('Toyota');

    c.onModelChange(corolla.id);
    c.onYearChange(2018);
    expect(emitted.at(-1)).toEqual({
      text: 'Toyota Corolla 2018',
      makeName: 'Toyota',
      modelName: 'Corolla',
      makeId: toyota.id,
      modelId: corolla.id,
      modelText: '',
      year: 2018,
    });
  });

  it('avisa la marca y el modelo por separado, para quien los guarda en campos aparte', () => {
    const { c, emitted } = montar();
    c.onMakeChange(toyota.id);
    c.onModelChange(corolla.id);
    expect(emitted.at(-1)).toMatchObject({ makeName: 'Toyota', modelName: 'Corolla', year: null });
  });

  it('el modelo solo ofrece los de la marca elegida, y cambiar de marca limpia el modelo', () => {
    const { c } = montar();
    c.onMakeChange(toyota.id);
    expect(c.modelOptions().every((o) => VEHICLE_MODELS_MOCK.find((m) => m.id === o.value)?.makeId === toyota.id)).toBe(true);

    c.onModelChange(corolla.id);
    const otra = VEHICLE_MAKES_MOCK.find((m) => m.id !== toyota.id)!;
    c.onMakeChange(otra.id);
    expect(c.modelId()).toBeNull();
  });

  it('arranca con lo ya elegido por ids: marca, modelo y año', () => {
    const { c } = montar({ text: 'Toyota Corolla 2018', makeId: toyota.id, modelId: corolla.id, year: 2018 });
    expect(c.makeId()).toBe(toyota.id);
    expect(c.modelId()).toBe(corolla.id);
    expect(c.year()).toBe(2018);
    expect(c.manual()).toBe(false);
  });

  describe('vehículos guardados solo por nombre (Auto Hub, antes del selector)', () => {
    it('los reconoce en el catálogo sin importar acentos ni mayúsculas', () => {
      const { c } = montar({ makeName: 'TOYOTA', modelName: 'corolla', year: 2015 });
      expect(c.makeId()).toBe(toyota.id);
      expect(c.modelId()).toBe(corolla.id);
      expect(c.year()).toBe(2015);
      expect(c.manual()).toBe(false);
    });

    it('si la marca no está en el catálogo, queda escrita a mano sin perder nada', () => {
      const { c } = montar({ makeName: 'Marca Rara', modelName: 'Modelo 1', year: 2010 });
      expect(c.manual()).toBe(true);
      expect(c.manualMake()).toBe('Marca Rara');
      expect(c.manualModel()).toBe('Modelo 1');
    });

    it('si la marca está pero el modelo no, conserva la marca del catálogo y el modelo como propio', () => {
      const { c, emitted } = montar({ makeName: 'Toyota', modelName: 'Modelo Que No Existe' });
      expect(c.manual()).toBe(false);
      expect(c.makeId()).toBe(toyota.id);
      expect(c.modelId()).toBeNull();
      expect(c.modelText()).toBe('Modelo Que No Existe');

      c.onYearChange(2012);
      expect(emitted.at(-1)).toMatchObject({ makeName: 'Toyota', modelName: 'Modelo Que No Existe', makeId: toyota.id, modelId: null });
    });

    it('un año viejo fuera de la lista se conserva como opción', () => {
      const { c } = montar({ makeName: 'Toyota', modelName: 'Corolla', year: 1982 });
      expect(c.yearOptions().some((o) => o.value === 1982)).toBe(true);
    });
  });

  it('un vehículo viejo con solo un texto se conserva y se puede editar', () => {
    const { c, el, emitted } = montar({ text: 'Jetta 2012' });
    expect(c.manual()).toBe(true);
    expect(el.querySelector<HTMLInputElement>('input[type=text]')).not.toBeNull();

    c.onManualModel('Jetta 2013');
    expect(emitted.at(-1)).toMatchObject({ text: 'Jetta 2013', makeId: null, modelId: null });
  });

  it('se puede cambiar a escribirlo a mano (marca y modelo) y volver al catálogo', () => {
    const { c, emitted } = montar();
    c.onMakeChange(toyota.id);
    c.toggleManual();
    c.onManualMake('Hino');
    c.onManualModel('300');
    c.onYearChange(2010);
    expect(emitted.at(-1)).toEqual({
      text: 'Hino 300 2010',
      makeName: 'Hino',
      modelName: '300',
      makeId: null,
      modelId: null,
      modelText: '',
      year: 2010,
    });

    c.toggleManual();
    expect(c.manual()).toBe(false);
    expect(emitted.at(-1)?.makeId).toBe(toyota.id);
  });

  it('una marca sin modelos cargados pide escribir el modelo', () => {
    const sinModelos = VEHICLE_MAKES_MOCK.find((m) => !VEHICLE_MODELS_MOCK.some((x) => x.makeId === m.id));
    if (!sinModelos) return; // el catálogo de prueba trae modelos para todas
    const { c, emitted } = montar();
    c.onMakeChange(sinModelos.id);
    expect(c.freeModel()).toBe(true);
    c.onModelTextChange('Modelo X');
    c.onYearChange(2021);
    expect(emitted.at(-1)?.text).toBe(`${sinModelos.name} Modelo X 2021`);
  });

  describe('un modelo o una marca que el catálogo no trae', () => {
    it('se usa lo escrito como modelo propio, con la marca del catálogo (un código como TFS55H-20)', () => {
      const isuzu = VEHICLE_MAKES_MOCK.find((m) => m.slug === 'isuzu') ?? toyota;
      const { c, emitted } = montar();
      c.onMakeChange(isuzu.id);
      c.onModelCustom('  TFS55H-20 ');
      c.onYearChange(2000);

      expect(c.modelId()).toBeNull();
      expect(emitted.at(-1)).toEqual({
        text: `${isuzu.name} TFS55H-20 2000`,
        makeName: isuzu.name,
        modelName: 'TFS55H-20',
        makeId: isuzu.id,
        modelId: null,
        modelText: 'TFS55H-20',
        year: 2000,
      });
    });

    it('elegir después uno del catálogo reemplaza al modelo propio', () => {
      const { c, emitted } = montar();
      c.onMakeChange(toyota.id);
      c.onModelCustom('Mi modelo');
      c.onModelChange(corolla.id);
      expect(c.modelText()).toBe('');
      expect(emitted.at(-1)).toMatchObject({ modelName: 'Corolla', modelId: corolla.id });
    });

    it('un modelo propio guardado se vuelve a mostrar al editar', () => {
      const { c } = montar({ makeId: toyota.id, modelId: null, modelText: 'TFS55H-20', year: 2000 });
      expect(c.makeId()).toBe(toyota.id);
      expect(c.modelText()).toBe('TFS55H-20');
      expect(c.manual()).toBe(false);
    });

    it('una marca propia pasa a escribirse a mano (marca y modelo)', () => {
      const { c, emitted } = montar();
      c.onMakeCustom('Marca Rara');
      expect(c.manual()).toBe(true);
      expect(c.manualMake()).toBe('Marca Rara');
      c.onManualModel('X1');
      expect(emitted.at(-1)).toMatchObject({ makeName: 'Marca Rara', modelName: 'X1', makeId: null });
    });
  });

  it('el año arranca bloqueado hasta elegir la marca', () => {
    const { el } = montar();
    expect(el.querySelectorAll('app-searchable-select')[2]).toBeTruthy();
  });
});
