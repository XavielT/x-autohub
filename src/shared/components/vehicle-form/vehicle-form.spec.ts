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
    await fixture.whenStable();
    fixture.detectChanges();

    expect(c.makes().length).toBe(35);
    const [make, model, year] = Array.from(el.querySelectorAll('input'));
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

  it('una marca sin modelos pide escribirlo, sin mandar a WhatsApp', () => {
    const { fixture, c, el } = montar();

    c.onMakeChange(subaru.id);
    fixture.detectChanges();

    expect(c.models()).toEqual([]);
    expect(c.freeModel()).toBe(true);
    expect(el.querySelector('input[name=modelText]')).not.toBeNull();
    expect(el.querySelector('.vf__hint')?.textContent).toContain('Aún no tenemos los modelos de esta marca; escríbelo tú.');
    expect(el.textContent).not.toContain('WhatsApp');
  });

  it('con el modelo escrito a mano emite modelId nulo y el texto', () => {
    const { fixture, c, chosen } = montar();
    c.onMakeChange(subaru.id);
    expect(c.isComplete()).toBe(false);

    c.onModelTextChange('  Impreza ');
    c.year.set(2012);
    fixture.detectChanges();
    expect(c.isComplete()).toBe(true);

    c.submit();
    expect(chosen).toEqual([{ makeId: subaru.id, modelId: null, modelText: 'Impreza', year: 2012 }]);
  });

  it('el boton se habilita solo con marca, modelo y año, y emite el vehículo', () => {
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

  it('el envío real del formulario emite el vehículo y no recarga la página', () => {
    // Regresión: con `(ngSubmit)` y sin FormsModule el envío nunca llegaba al componente y el navegador
    // hacía un GET nativo (`/?modelText=…`). Aquí se dispara el evento `submit` de verdad.
    const { fixture, c, el, chosen } = montar();
    c.onMakeChange(toyota.id);
    c.modelId.set(corolla.id);
    c.year.set(2015);
    fixture.detectChanges();

    const event = new Event('submit', { cancelable: true, bubbles: true });
    el.querySelector('form')!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(chosen).toEqual([{ makeId: toyota.id, modelId: corolla.id, year: 2015 }]);
  });

  it('no emite si falta algo', () => {
    const { c, chosen } = montar();
    c.onMakeChange(toyota.id);
    c.submit();
    expect(chosen).toEqual([]);
  });

  it('ofrece años desde el que viene hasta 1990', () => {
    const { c } = montar();
    const next = new Date().getFullYear() + 1;

    expect(c.years[0]).toBe(next);
    expect(c.years[c.years.length - 1]).toBe(1990);
    expect(c.years.length).toBe(next - 1990 + 1);
  });

  it('empieza con el vehículo que ya estaba elegido', () => {
    TestBed.inject(VehicleService).select({ makeId: toyota.id, modelId: corolla.id, year: 2015 });

    const { c } = montar();

    expect(c.makeId()).toBe(toyota.id);
    expect(c.modelId()).toBe(corolla.id);
    expect(c.year()).toBe(2015);
    expect(c.isComplete()).toBe(true);
  });

  it('los id de los selectores llevan el prefijo, para poder tenerlo dos veces en la página', () => {
    const fixture = TestBed.createComponent(VehicleForm);
    fixture.componentRef.setInput('idPrefix', 'hvp');
    fixture.detectChanges();

    const ids = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('input')).map((s) => s.id);
    expect(ids).toEqual(['hvp-make', 'hvp-model', 'hvp-year']);
  });
});
