import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AdminClientes } from './admin-clientes';
import { BusinessCustomerService } from '../../../../shared/services/business-customer.service';
import { ToastService } from '../../../../shared/services/toast.service';

describe('AdminClientes (/admin/clientes)', () => {
  const toast = { show: vi.fn() };
  const input = (value: string) => ({ target: { value } }) as unknown as Event;

  beforeEach(() => {
    localStorage.clear();
    toast.show.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: ToastService, useValue: toast }, provideRouter([])],
    });
  });

  afterEach(() => localStorage.clear());

  async function montar(seed = true) {
    if (seed) {
      const service = TestBed.inject(BusinessCustomerService);
      await firstValueFrom(
        service.save({ id: null, name: 'José Pérez', phone: '809-555-0134', email: 'jose@ejemplo.com', rnc: '131-12345-6', address: '', notes: '', vehicles: [{ text: 'Corolla', plate: 'B999', mileage: '', vin: '' }] }),
      );
      await firstValueFrom(
        service.save({ id: null, name: 'Ana Lora', phone: '829-111-2222', email: 'ana@lora.do', rnc: '', address: '', notes: '', vehicles: [] }),
      );
    }
    const fixture = TestBed.createComponent(AdminClientes);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('lista a los clientes guardados', async () => {
    const { el } = await montar();
    expect(el.textContent).toContain('José Pérez');
    expect(el.textContent).toContain('Ana Lora');
  });

  it('sin clientes dice cómo empezar', async () => {
    const { el } = await montar(false);
    expect(el.textContent).toContain('Todavía no hay clientes');
  });

  it('busca por nombre, por RNC, por teléfono y por correo', async () => {
    const { c } = await montar();
    const names = () => c.shown().map((x) => x.name);

    c.setQuery(input('lora'));
    expect(names()).toEqual(['Ana Lora']);

    c.setQuery(input('131-12345'));
    expect(names()).toEqual(['José Pérez']);

    c.setQuery(input('5550134'));
    expect(names()).toEqual(['José Pérez']);

    c.setQuery(input('ana@lora'));
    expect(names()).toEqual(['Ana Lora']);

    c.setQuery(input('zzz'));
    expect(names()).toEqual([]);

    c.clearQuery();
    expect(names()).toHaveLength(2);
  });

  it('dice cuántos coinciden y avisa cuando ninguno', async () => {
    const { fixture, c, el } = await montar();
    c.setQuery(input('jose'));
    fixture.detectChanges();
    expect(el.textContent).toContain('1 de 2');

    c.setQuery(input('nadie'));
    fixture.detectChanges();
    expect(el.textContent).toContain('Ningún cliente coincide');
  });

  it('crea un cliente nuevo con sus vehículos', async () => {
    const { fixture, c } = await montar(false);
    c.startNew();
    c.setText('name', input('Marta Díaz'));
    c.setText('rnc', input('001-9999999-1'));
    c.addVehicle();
    c.setVehicle(0, 'text', input('Honda Civic 2019'));
    c.setVehicle(0, 'plate', input('H123'));
    c.save();
    await fixture.whenStable();

    expect(c.draft()).toBeNull();
    expect(c.customers()).toHaveLength(1);
    expect(c.customers()[0].vehicles[0]).toMatchObject({ text: 'Honda Civic 2019', plate: 'H123' });
  });

  it('el vehículo se elige del catálogo (marca, modelo, año) y se guarda con sus ids', async () => {
    const { fixture, c } = await montar(false);
    c.startNew();
    c.setText('name', input('Marta Díaz'));
    c.addVehicle();
    c.setVehiclePick(0, { text: 'Toyota Corolla 2018', makeId: 1, modelId: 3, modelText: '', year: 2018 });
    c.setVehicle(0, 'plate', input('H123'));
    c.save();
    await fixture.whenStable();

    expect(c.customers()[0].vehicles[0]).toMatchObject({
      text: 'Toyota Corolla 2018',
      plate: 'H123',
      makeId: 1,
      modelId: 3,
      year: 2018,
    });

    // Al volver a editarlo, el selector arranca con lo elegido.
    c.edit(c.customers()[0]);
    expect(c.draft()!.vehicles[0]).toMatchObject({ makeId: 1, modelId: 3, year: 2018 });
  });

  it('un vehículo escrito a mano no guarda ids vacíos', async () => {
    const { fixture, c } = await montar(false);
    c.startNew();
    c.setText('name', input('Pedro'));
    c.addVehicle();
    c.setVehiclePick(0, { text: 'Camión Hino 2010', makeId: null, modelId: null, modelText: '', year: null });
    c.save();
    await fixture.whenStable();

    const v = c.customers()[0].vehicles[0];
    expect(v.text).toBe('Camión Hino 2010');
    expect('makeId' in v).toBe(false);
  });

  it('quitar un vehículo no mezcla los demás', async () => {
    const { c } = await montar(false);
    c.startNew();
    c.addVehicle();
    c.addVehicle();
    c.setVehiclePick(0, { text: 'Primero', makeId: null, modelId: null, modelText: '', year: null });
    c.setVehiclePick(1, { text: 'Segundo', makeId: null, modelId: null, modelText: '', year: null });
    const keys = c.vehicleKeys();

    c.removeVehicle(0);
    expect(c.draft()!.vehicles.map((v) => v.text)).toEqual(['Segundo']);
    expect(c.vehicleKeys()).toEqual([keys[1]]);
  });

  it('sin nombre no guarda y lo dice', async () => {
    const { fixture, c } = await montar(false);
    c.startNew();
    c.save();
    await fixture.whenStable();
    expect(c.customers()).toHaveLength(0);
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('nombre'), 'error');
  });

  it('edita a un cliente: los cambios quedan guardados', async () => {
    const { fixture, c } = await montar();
    const jose = c.customers().find((x) => x.name === 'José Pérez')!;
    c.edit(jose);
    c.setText('phone', input('849 000 0000'));
    c.removeVehicle(0);
    c.save();
    await fixture.whenStable();

    const after = c.customers().find((x) => x.id === jose.id)!;
    expect(after.phone).toBe('849 000 0000');
    expect(after.vehicles).toEqual([]);
    expect(c.customers()).toHaveLength(2);
  });

  it('borrar pide una segunda pulsación', async () => {
    const { fixture, c } = await montar();
    const ana = c.customers().find((x) => x.name === 'Ana Lora')!;

    c.askDelete(ana);
    expect(c.pendingDelete()).toBe(ana.id);
    expect(c.customers()).toHaveLength(2);

    c.askDelete(ana);
    await fixture.whenStable();
    expect(c.customers().map((x) => x.name)).toEqual(['José Pérez']);
  });

  it('ofrece WhatsApp solo a quien tiene teléfono', async () => {
    const { c } = await montar();
    const jose = c.customers().find((x) => x.name === 'José Pérez')!;
    expect(c.whatsappLink(jose)).toContain('wa.me/18095550134');
    expect(c.whatsappLink({ ...jose, phone: '' })).toBe('');
  });
});
