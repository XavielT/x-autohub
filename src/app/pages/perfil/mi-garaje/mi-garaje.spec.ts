import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { MiGaraje, GarageRow } from './mi-garaje';
import { VehicleService } from '../../../../shared/services/vehicle.service';
import { ToastService } from '../../../../shared/services/toast.service';

describe('MiGaraje', () => {
  const row = { vehicle: { id: 7, isDefault: false }, label: 'Toyota Corolla 2015' } as unknown as GarageRow;

  function montar() {
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: { show: vi.fn() } }] });
    const vehicles = TestBed.inject(VehicleService);
    const quitar = vi.spyOn(vehicles, 'removeFromGarage').mockReturnValue(of(undefined));
    const fixture = TestBed.createComponent(MiGaraje);
    return { c: fixture.componentInstance, quitar };
  }

  it('quitar un vehículo pide un segundo toque', () => {
    const { c, quitar } = montar();

    c.remove(row);
    expect(c.confirmRemoveId()).toBe(7);
    expect(quitar).not.toHaveBeenCalled();

    c.remove(row);
    expect(quitar).toHaveBeenCalledWith(7);
    expect(c.confirmRemoveId()).toBeNull();
  });
});
