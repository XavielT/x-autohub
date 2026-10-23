import { TestBed } from '@angular/core/testing';
import { VehicleForm } from './vehicle-form';
import { VehicleService } from '../../services/vehicle.service';
import { VEHICLE_MAKES_MOCK, VEHICLE_MODELS_MOCK } from '../../data/vehicle.mock';
import { SelectedVehicle } from '../../models/product.model';

const toyota = VEHICLE_MAKES_MOCK.find((m) => m.slug === 'toyota')!;
const honda = VEHICLE_MAKES_MOCK.find((m) => m.slug === 'honda')!;
const corolla = VEHICLE_MODELS_MOCK.find((m) => m.makeId === toyota.id && m.slug === 'corolla')!;
const subaru = VEHICLE_MAKES_MOCK.find((m) => m.slug === 'subaru')!;

describe('VehicleForm', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function montar() {
    const fixture = TestBed.createComponent(VehicleForm);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const chosen: SelectedVehicle[] = [];
    c.chosen.subscribe((v) => chosen.push(v));
    return { fixture, c, el: fixture.nativeElement as HTMLElement, chosen };
  }

  it('arranca con las 35 marcas y el resto bloqueado', async () => {
    const { fixture, c, el } = montar();
    // ngModel aplica [disabled] en una microtarea.
    await fixture.whenStable();
    fixture.detectChanges();

    expect(c.makes().length).toBe(35);
    const [make, model, year] = Array.from(el.querySelectorAll('select'));
    expect(make.disabled).toBe(false);
    expect(model.disabled).toBe(true);
    expect(year.disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('.vf__submit')?.disabled).toBe(true);
  });

  it('elegir la marca carga sus modelos', () => {
    const { c } = montar();

    c.onMakeChange(toyota.id);

    expect(c.models().length).toBe(11);
    expect(c.models().every((m) => m.makeId === toyota.id)).toBe(true);
  });

  it('cambiar de marca borra el modelo elegido: el de otra marca no vale', () => {
    const { c } = montar();
    c.onMakeChange(toyota.id);
    c.modelId.set(corolla.id);

    c.onMakeChange(honda.id);

    expect(c.modelId()).toBeNull();
    expect(c.models().every((m) => m.makeId === honda.id)).toBe(true);
  });

  it('una marca sin modelos lo dice y manda a escribir por WhatsApp', () => {
    const { fixture, c, el } = montar();

    c.onMakeChange(subaru.id);
    fixture.detectChanges();

    expect(c.models()).toEqual([]);
    expect(el.textContent).toContain('Todavía no tenemos modelos de esta marca');
  });

  it('el boton se habilita solo con marca, modelo y ano, y emite el vehiculo', () => {
    const { fixture, c, el, chosen } = montar();
    const submit = () => el.querySelector<HTMLButtonElement>('.vf__submit')!;

    c.onMakeChange(toyota.id);
    c.modelId.set(corolla.id);
    fixture.detectChanges();
    expect(submit().disabled).toBe(true); // falta el ano

    c.year.set(2015);
    fixture.detectChanges();
    expect(submit().disabled).toBe(false);

    c.submit();
    expect(chosen).toEqual([{ makeId: toyota.id, modelId: corolla.id, year: 2015 }]);
  });

  it('no emite si falta algo', () => {
    const { c, chosen } = montar();
    c.onMakeChange(toyota.id);
    c.submit();
    expect(chosen).toEqual([]);
  });

  it('ofrece anos desde el que viene hasta 1980', () => {
    const { c } = montar();
    const next = new Date().getFullYear() + 1;

    expect(c.years[0]).toBe(next);
    expect(c.years[c.years.length - 1]).toBe(1980);
    expect(c.years.length).toBe(next - 1980 + 1);
  });

  it('empieza con el vehiculo que ya estaba elegido', () => {
    TestBed.inject(VehicleService).select({ makeId: toyota.id, modelId: corolla.id, year: 2015 });

    const { c } = montar();

    expect(c.makeId()).toBe(toyota.id);
    expect(c.modelId()).toBe(corolla.id);
    expect(c.year()).toBe(2015);
    expect(c.isComplete()).toBe(true);
  });

  it('los id de los selectores llevan el prefijo, para poder tenerlo dos veces en la pagina', () => {
    const fixture = TestBed.createComponent(VehicleForm);
    fixture.componentRef.setInput('idPrefix', 'hvp');
    fixture.detectChanges();

    const ids = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('select')).map((s) => s.id);
    expect(ids).toEqual(['hvp-make', 'hvp-model', 'hvp-year']);
  });
});
