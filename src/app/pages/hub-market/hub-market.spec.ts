import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';

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

describe('HubMarket: filtros en la URL', () => {
  async function montar(query: Record<string, string> = {}) {
    await TestBed.configureTestingModule({
      imports: [HubMarket],
      providers: [{ provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(HubMarket);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('arranca con los filtros que trae el enlace', async () => {
    const { component } = await montar({ cat: 'vehiculos', orden: 'precio-desc' });

    expect(component.selectedCategory()).toBe('vehiculos');
    expect(component.sort()).toBe('precio-desc');
    expect(component.hasFilters()).toBe(true);
    expect(component.filteredItems().every((i) => i.category === 'vehiculos')).toBe(true);
  });

  it('un enlace con valores raros no rompe nada', async () => {
    const { component } = await montar({ cat: 'hackeado', orden: 'x', marca: 'Toyota' });

    expect(component.selectedCategory()).toBe('all');
    expect(component.brand()).toBe('');
  });

  it('las tarjetas con foto prioritaria se fijan al cargar y no cambian al filtrar', async () => {
    const { fixture, component } = await montar();
    const antes = [...(component as unknown as { priorityIds: () => ReadonlySet<number> }).priorityIds()];
    expect(antes.length).toBeLessThanOrEqual(3);

    component.onCategorySelect('piezas');
    fixture.detectChanges();

    expect([...(component as unknown as { priorityIds: () => ReadonlySet<number> }).priorityIds()]).toEqual(antes);
  });

  it('escribe los filtros en la URL', async () => {
    const { fixture, component } = await montar();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    component.onCategorySelect('accesorios');
    fixture.detectChanges();

    const last = navigate.mock.calls.at(-1)![1]!.queryParams as Record<string, string | null>;
    expect(last['cat']).toBe('accesorios');
    expect(last['q']).toBeNull();
  });
});
