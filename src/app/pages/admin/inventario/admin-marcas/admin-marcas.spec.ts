import { TestBed } from '@angular/core/testing';
import { AdminMarcas } from './admin-marcas';
import { ToastService } from '../../../../../shared/services/toast.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { VehicleService } from '../../../../../shared/services/vehicle.service';
import { firstValueFrom } from 'rxjs';

describe('AdminMarcas', () => {
  const show = vi.fn();

  function montar() {
    show.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: { show } }] });
    const fixture = TestBed.createComponent(AdminMarcas);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('carga las 35 marcas y no muestra modelos hasta elegir una', () => {
    const { c, el } = montar();

    expect(c.makes().length).toBe(35);
    expect(el.querySelectorAll('.mk__model').length).toBe(0);
  });

  it('al elegir una marca muestra sus modelos', () => {
    const { fixture, c, el } = montar();
    const toyota = c.makes().find((m) => m.slug === 'toyota')!;

    c.selectMake(toyota.id);
    fixture.detectChanges();

    expect(c.models().length).toBe(11);
    expect(el.querySelectorAll('.mk__model').length).toBe(11);
    expect(el.textContent).toContain('Corolla');
  });

  it('una marca sin modelos lo dice', () => {
    const { fixture, c, el } = montar();
    const subaru = c.makes().find((m) => m.slug === 'subaru')!;

    c.selectMake(subaru.id);
    fixture.detectChanges();

    expect(el.textContent).toContain('Subaru todavía no tiene modelos');
  });

  it('agrega una marca nueva en su lugar alfabetico y la deja elegida', () => {
    const { c } = montar();
    c.newMakeName.set('Abarth');

    c.addMake();

    expect(c.makes().length).toBe(36);
    expect(c.makes()[0].name).toBe('Abarth');
    expect(c.selectedMake()?.name).toBe('Abarth');
    expect(c.newMakeName()).toBe('');
  });

  it('una marca repetida da el error de la base', () => {
    const { c } = montar();
    c.newMakeName.set('toyota');

    c.addMake();

    expect(c.makes().length).toBe(35);
    expect(show).toHaveBeenCalledWith('Ese registro ya existe.', 'error');
  });

  it('agrega un modelo a la marca elegida', () => {
    const { c } = montar();
    c.selectMake(c.makes().find((m) => m.slug === 'toyota')!.id);
    c.newModelName.set('Avensis');

    c.addModel();

    expect(c.models().length).toBe(12);
    expect(c.models().some((m) => m.name === 'Avensis')).toBe(true);
    expect(show).toHaveBeenCalledWith('Toyota Avensis agregado.');
  });

  it('no agrega un modelo sin marca elegida ni sin nombre', () => {
    const { c } = montar();
    c.newModelName.set('Algo');
    c.addModel();
    expect(c.models()).toEqual([]);

    c.selectMake(c.makes()[0].id);
    c.newModelName.set('');
    c.addModel();
    expect(show).toHaveBeenCalledWith('Escribe el nombre del modelo.', 'error');
  });

  it('"Crear modelo" agrega el modelo y migra los garajes que lo escribieron', async () => {
    const { fixture, c } = montar();
    const vehicles = TestBed.inject(VehicleService);
    const subaru = c.makes().find((m) => m.slug === 'subaru')!;
    // Un usuario con sesión simulada que escribió el modelo.
    vi.spyOn(TestBed.inject(AuthService), 'user').mockReturnValue({ id: 'u-1' } as never);
    await firstValueFrom(vehicles.addToGarage({ makeId: subaru.id, modelId: null, modelText: 'Impreza', year: 2012 }));

    c.ngOnInit();
    expect(c.unmatched()).toEqual([{ makeId: subaru.id, makeName: 'Subaru', modelText: 'Impreza', vehicles: 1 }]);

    c.selectMake(subaru.id);
    c.createFromText(c.unmatched()[0]);
    fixture.detectChanges();

    expect(c.unmatched()).toEqual([]);
    expect(c.models().map((m) => m.name)).toContain('Impreza');
    const [row] = await firstValueFrom(vehicles.getGarage());
    expect(row.modelText).toBeNull();
    expect(row.modelId).not.toBeNull();
  });
});
