import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AutoHub } from './auto-hub';

describe('AutoHub', () => {
  let component: AutoHub;
  let fixture: ComponentFixture<AutoHub>;
  const pantalla = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutoHub]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AutoHub);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('los filtros avanzados empiezan cerrados y el boton los abre', () => {
    expect(pantalla().querySelector('.autohub__filters-panel')).toBeNull();
    pantalla().querySelector<HTMLButtonElement>('.autohub__filters-toggle')!.click();
    fixture.detectChanges();
    expect(pantalla().querySelector('.autohub__filters-panel')).not.toBeNull();
  });

  it('un filtro reduce el listado, el boton cuenta cuantos hay y limpiar los quita', () => {
    const total = component.filteredAutos().length;
    expect(total).toBeGreaterThan(1);

    component.set('maxPrice', 1);
    fixture.detectChanges();
    expect(component.activeCount()).toBe(1);
    expect(pantalla().querySelector('.autohub__filters-toggle')!.textContent).toContain('(1)');
    expect(component.filteredAutos().length).toBeLessThan(total);

    component.set('fuel', 'electric');
    component.set('maxPrice', 1);
    component.setNumber('maxPrice', '');
    expect(component.filters().maxPrice).toBeNull();

    component.set('minYear', 3000);
    fixture.detectChanges();
    expect(component.filteredAutos()).toHaveLength(0);
    expect(pantalla().textContent).toContain('Ningún vehículo coincide con tus filtros');

    component.clearFilters();
    fixture.detectChanges();
    expect(component.filteredAutos()).toHaveLength(total);
    expect(component.isFiltered()).toBe(false);
  });
});
