import { TestBed } from '@angular/core/testing';
import { VehiclePickerModal } from './vehicle-picker-modal';
import { VehiclePickerService } from '../../services/vehicle-picker.service';
import { VehicleService } from '../../services/vehicle.service';
import { ToastService } from '../../services/toast.service';

describe('VehiclePickerModal', () => {
  const toast = { show: vi.fn() };

  // El vehiculo elegido se guarda en localStorage: sin limpiarlo, una prueba que
  // elige uno deja a la siguiente con el boton de quitar ya puesto.
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function montar() {
    toast.show.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: toast }] });
    const fixture = TestBed.createComponent(VehiclePickerModal);
    fixture.detectChanges();
    return {
      fixture,
      c: fixture.componentInstance,
      el: fixture.nativeElement as HTMLElement,
      picker: TestBed.inject(VehiclePickerService),
      vehicles: TestBed.inject(VehicleService),
    };
  }

  it('cerrado no pinta nada', () => {
    const { el } = montar();
    expect(el.querySelector('.vpm')).toBeNull();
    expect(el.querySelector('.vpm__overlay')).toBeNull();
  });

  it('al abrirlo pinta el dialogo accesible con el formulario', () => {
    const { fixture, picker, el } = montar();

    picker.open();
    fixture.detectChanges();

    const dialog = el.querySelector('.vpm');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(el.querySelector('app-vehicle-form')).not.toBeNull();
    expect(el.querySelector('.vpm__clear')).toBeNull(); // sin vehiculo no hay que quitar
  });

  it('elegir un vehiculo lo guarda, cierra y avisa', () => {
    const { fixture, c, picker, vehicles } = montar();
    picker.open();
    fixture.detectChanges();

    c.choose({ makeId: 1, modelId: 1, year: 2015 });

    expect(vehicles.selected()).toEqual({ makeId: 1, modelId: 1, year: 2015 });
    expect(picker.isOpen()).toBe(false);
    expect(toast.show).toHaveBeenCalled();
  });

  it('con un vehiculo elegido muestra cual y deja quitarlo', () => {
    const { fixture, c, picker, vehicles, el } = montar();
    vehicles.select({ makeId: 1, modelId: 1, year: 2015 });
    fixture.detectChanges();
    picker.open();
    fixture.detectChanges();

    expect(el.querySelector('.vpm__clear')).not.toBeNull();

    c.clear();

    expect(vehicles.selected()).toBeNull();
    expect(picker.isOpen()).toBe(false);
  });

  it('el fondo y Escape lo cierran', () => {
    const { fixture, c, picker, el } = montar();
    picker.open();
    fixture.detectChanges();

    (el.querySelector('.vpm__overlay') as HTMLElement).click();
    expect(picker.isOpen()).toBe(false);

    picker.open();
    c.close();
    expect(picker.isOpen()).toBe(false);
  });

  it('cerrar con el modal ya cerrado no hace nada', () => {
    const { c, picker } = montar();
    expect(() => c.close()).not.toThrow();
    expect(picker.isOpen()).toBe(false);
  });
});
