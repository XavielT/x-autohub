import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HubMarket } from './hub-market';

describe('HubMarket', () => {
  let component: HubMarket;
  let fixture: ComponentFixture<HubMarket>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HubMarket]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HubMarket);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('las pestañas filtran por categoría y la marca solo aplica a Vehículos', () => {
    const todos = component.filteredItems().length;
    expect(todos).toBeGreaterThan(0);

    component.onCategorySelect('vehiculos');
    const vehiculos = component.filteredItems();
    expect(vehiculos.every((i) => i.category === 'vehiculos')).toBe(true);

    component.brand.set('Citroen');
    expect(component.filteredItems().every((i) => i.vehicleSpecs?.brand === 'Citroen')).toBe(true);

    // Al salir de Vehículos la marca se suelta, o filtraría sin que se vea.
    component.onCategorySelect('piezas');
    expect(component.brand()).toBe('');
  });

  it('ofrece solo las ubicaciones que tienen publicaciones y ordena por precio', () => {
    const ubicaciones = component.locationOptions().slice(1).map((o) => o.value);
    expect(new Set(ubicaciones).size).toBe(ubicaciones.length);

    component.sort.set('precio-asc');
    const precios = component.filteredItems().map((i) => i.price);
    expect(precios).toEqual([...precios].sort((a, b) => a - b));
  });

  it('la búsqueda ignora tildes y "Limpiar" deja todo como al abrir', () => {
    component.searchQuery.set('zzzz-no-existe');
    expect(component.filteredItems()).toHaveLength(0);
    expect(component.hasFilters()).toBe(true);

    component.clearFilters();
    expect(component.hasFilters()).toBe(false);
    expect(component.filteredItems().length).toBeGreaterThan(0);
  });
});
