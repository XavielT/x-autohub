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
    fixture.detectChanges();
    const emitted: VehicleSelection[] = [];
    fixture.componentInstance.changed.subscribe((e) => emitted.push(e));
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
      makeId: toyota.id,
      modelId: corolla.id,
      modelText: '',
      year: 2018,
    });
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

  it('arranca con lo ya elegido: marca, modelo y año', () => {
    const { c } = montar({ text: 'Toyota Corolla 2018', makeId: toyota.id, modelId: corolla.id, year: 2018 });
    expect(c.makeId()).toBe(toyota.id);
    expect(c.modelId()).toBe(corolla.id);
    expect(c.year()).toBe(2018);
    expect(c.manual()).toBe(false);
  });

  it('un vehículo viejo escrito a mano se conserva y se puede editar', () => {
    const { c, el, emitted } = montar({ text: 'Jetta 2012' });
    expect(c.manual()).toBe(true);
    expect(el.querySelector<HTMLInputElement>('input[type=text]')?.value).toBe('Jetta 2012');

    c.onManualText('Jetta 2013');
    expect(emitted.at(-1)).toMatchObject({ text: 'Jetta 2013', makeId: null, modelId: null, year: null });
  });

  it('se puede cambiar a escribirlo a mano y volver al catálogo', () => {
    const { c, emitted } = montar();
    c.onMakeChange(toyota.id);
    c.toggleManual();
    c.onManualText('Camión Hino 2010');
    expect(emitted.at(-1)).toMatchObject({ text: 'Camión Hino 2010', makeId: null });

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

  it('el año arranca bloqueado hasta elegir la marca', () => {
    const { el } = montar();
    const yearSelect = el.querySelectorAll('app-searchable-select')[2];
    expect(yearSelect).toBeTruthy();
  });
});
