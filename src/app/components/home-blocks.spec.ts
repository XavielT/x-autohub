import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';

import { HomeSearch } from './home-search/home-search';
import { HomeCategories } from './home-categories/home-categories';
import { HomeVehiclePicker } from './home-vehicle-picker/home-vehicle-picker';
import { HomeOffers } from './home-offers/home-offers';
import { HomeBestsellers } from './home-bestsellers/home-bestsellers';
import { HomeNewArrivals } from './home-new-arrivals/home-new-arrivals';
import { HomeProductRow } from './home-product-row/home-product-row';
import { HomeServicesBanner } from './home-services-banner/home-services-banner';
import { HomeTrustStrip } from './home-trust-strip/home-trust-strip';
import { HomeVehicles } from './home-vehicles/home-vehicles';
import { HomeCommunity } from './home-community/home-community';
import { Home } from '../pages/home/home';
import { CategoryService } from '../../shared/services/category.service';
import { ProductService } from '../../shared/services/product.service';
import { ServiciosCardService } from '../../shared/services/servicios-card.service';
import { HubMarketService } from '../../shared/services/hub-market.service';
import { VehicleService } from '../../shared/services/vehicle.service';
import { makeProduct } from '../../shared/testing/product.fixture';

/**
 * Los diez bloques del home, cada uno con datos de los mocks y vacio.
 *
 * "Vacio" importa tanto como "con datos": con la base recien creada (o la real,
 * donde todavia no hay ofertas) el home no puede enseñar secciones sin nada.
 */
describe('bloques del home', () => {
  // Elegir un vehiculo lo guarda en localStorage: que no pase a la prueba siguiente.
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  const html = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  describe('home-search', () => {
    it('es el buscador grande con el copy del pivote, sin video', () => {
      const fixture = TestBed.createComponent(HomeSearch);
      fixture.detectChanges();
      const el = html(fixture);

      expect(el.querySelector('h1')?.textContent).toContain('Todo lo que tu carro necesita');
      expect(el.querySelector('.sb--hero')).not.toBeNull();
      expect(el.querySelector('video')).toBeNull();
    });
  });

  describe('home-categories', () => {
    it('muestra una chip por cada categoría de primer nivel, con enlace a la tienda', async () => {
      const fixture = TestBed.createComponent(HomeCategories);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = html(fixture);

      const chips = Array.from(el.querySelectorAll('.hcat__chip'));
      expect(chips.length).toBe(12);
      expect(chips[0].textContent).toContain('Accesorios interior');
      expect(chips[0].getAttribute('href')).toBe('/tienda/c/accesorios-interior');
      // El icono es un SVG por categoría (0041): la máscara apunta a su archivo.
      const icon = chips[0].querySelector<HTMLElement>('.hcat__icon--svg');
      expect(icon?.style.getPropertyValue('--icon')).toContain('assets/icons/categories/accesorios-interior.svg');
    });

    it('una categoría sin icono cae a la inicial', () => {
      TestBed.configureTestingModule({
        providers: [{
          provide: CategoryService,
          useValue: { getTree: () => of([{ id: 1, parentId: null, slug: 'x', name: 'Zeta', icon: null, sortOrder: 1, isActive: true, children: [] }]) },
        }],
      });
      const fixture = TestBed.createComponent(HomeCategories);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.hcat__icon')?.textContent?.trim()).toBe('Z');
      expect(el.querySelector('.hcat__icon--svg')).toBeNull();
    });

    it('sin categorías no pinta nada', () => {
      TestBed.configureTestingModule({ providers: [{ provide: CategoryService, useValue: { getTree: () => of([]) } }] });
      const fixture = TestBed.createComponent(HomeCategories);
      fixture.detectChanges();

      expect(html(fixture).querySelector('.hcat')).toBeNull();
    });
  });

  describe('home-vehicle-picker', () => {
    it('sin vehículo muestra el formulario', () => {
      const fixture = TestBed.createComponent(HomeVehiclePicker);
      fixture.detectChanges();
      const el = html(fixture);

      expect(el.querySelector('app-vehicle-form')).not.toBeNull();
      expect(el.querySelector('.hvp__current')).toBeNull();
    });

    it('elegir guarda el vehículo, muestra cual es y ofrece ver la tienda o cambiarlo', async () => {
      const fixture = TestBed.createComponent(HomeVehiclePicker);
      fixture.detectChanges();
      const vehicles = TestBed.inject(VehicleService);

      fixture.componentInstance.choose({ makeId: 1, modelId: 1, year: 2015 });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = html(fixture);

      expect(vehicles.selected()).toEqual({ makeId: 1, modelId: 1, year: 2015 });
      expect(el.querySelector('.hvp__current strong')?.textContent).toContain('Toyota Corolla 2015');
      expect(el.querySelector('.hvp__cta')?.getAttribute('href')).toBe('/tienda');

      fixture.componentInstance.clear();
      fixture.detectChanges();
      expect(vehicles.selected()).toBeNull();
      expect(el.querySelector('app-vehicle-form')).not.toBeNull();
    });
  });

  describe('home-product-row', () => {
    const offer = makeProduct({ id: 1, name: 'Filtro', price: 2850, compareAtPrice: 3400 });

    it('cada producto se pinta con la tarjeta de la tienda, que es la dueña del precio y la oferta', () => {
      const fixture = TestBed.createComponent(HomeProductRow);
      fixture.componentRef.setInput('eyebrow', 'Tienda');
      fixture.componentRef.setInput('title', 'Ofertas');
      fixture.componentRef.setInput('products', [offer]);
      fixture.detectChanges();
      const el = html(fixture);

      expect(el.querySelectorAll('app-catalogo-card').length).toBe(1);
      expect(el.querySelector('.hrow__deal')).toBeNull();
    });

    it('el carrusel y la cuadricula se distinguen por clase', () => {
      const fixture = TestBed.createComponent(HomeProductRow);
      fixture.componentRef.setInput('eyebrow', 'Tienda');
      fixture.componentRef.setInput('title', 'Ofertas');
      fixture.componentRef.setInput('products', [offer]);
      fixture.componentRef.setInput('layout', 'carousel');
      fixture.detectChanges();

      expect(html(fixture).querySelector('.hrow--carousel')).not.toBeNull();
    });
  });

  describe.each([
    ['home-offers', HomeOffers, 'getOffers', 'Ofertas'],
    ['home-bestsellers', HomeBestsellers, 'getBestSellers', 'Más vendidos'],
    ['home-new-arrivals', HomeNewArrivals, 'getNewArrivals', 'Nuevos'],
  ] as const)('%s', (_name, component, method, title) => {
    it('con productos pinta su sección', async () => {
      const fixture = TestBed.createComponent(component);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = html(fixture);

      expect(el.querySelector('.hs__title')?.textContent).toContain(title);
      expect(el.querySelectorAll('app-catalogo-card').length).toBeGreaterThan(0);
    });

    it('sin productos se oculta entera', () => {
      const empty = (): Observable<never[]> => of([]);
      TestBed.configureTestingModule({
        providers: [{ provide: ProductService, useValue: { [method]: empty } }],
      });
      const fixture = TestBed.createComponent(component);
      fixture.detectChanges();

      expect(html(fixture).querySelector('section')).toBeNull();
    });
  });

  describe('home-offers: solo lo que tiene oferta', () => {
    it('las tarjetas son productos con precio anterior, y la tarjeta pinta su descuento', async () => {
      const fixture = TestBed.createComponent(HomeOffers);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = html(fixture);

      const cards = el.querySelectorAll('app-catalogo-card').length;
      expect(cards).toBe(6); // los 6 del mock con compare_at_price
      expect(el.querySelectorAll('.hub-part-card__off').length).toBe(cards);
      expect(el.querySelector('.hrow--carousel')).not.toBeNull();
    });
  });

  describe('home-bestsellers y home-new-arrivals', () => {
    it('muestran cuatro, los más vendidos de mayor a menor', async () => {
      const fixture = TestBed.createComponent(HomeBestsellers);
      fixture.detectChanges();
      await fixture.whenStable();

      const ids = fixture.componentInstance.products()!.map((p) => p.soldCount);
      expect(ids.length).toBe(4);
      expect(ids).toEqual([...ids].sort((a, b) => b - a));
    });

    it('lo nuevo no trae la pieza de prueba para un visitante', async () => {
      const fixture = TestBed.createComponent(HomeNewArrivals);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.componentInstance.products()!.some((p) => p.isTest)).toBe(false);
    });
  });

  describe('home-services-banner', () => {
    it('tiene los dos botones y los servicios del catálogo', async () => {
      const fixture = TestBed.createComponent(HomeServicesBanner);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = html(fixture);

      const quote = el.querySelector('.whatsapp-btn') as HTMLAnchorElement;
      expect(quote.href).toContain('https://wa.me/18099539782?text=');
      expect(quote.textContent).toContain('Cotizar por WhatsApp');
      expect(el.querySelector('.hsb__book')?.textContent).toContain('Agendar cita');
      expect(el.querySelector('.hsb__book')?.getAttribute('href')).toBe('/servicios/agendar');
      expect(el.querySelectorAll('.hsb__item').length).toBe(4);
    });

    it('sin servicios deja solo los botones', () => {
      TestBed.configureTestingModule({
        providers: [{ provide: ServiciosCardService, useValue: { getServicios: () => of([]) } }],
      });
      const fixture = TestBed.createComponent(HomeServicesBanner);
      fixture.detectChanges();
      const el = html(fixture);

      expect(el.querySelector('.hsb__list')).toBeNull();
      expect(el.querySelector('.whatsapp-btn')).not.toBeNull();
    });
  });

  describe('home-trust-strip', () => {
    it('dice las cuatro cosas de la franja', () => {
      const fixture = TestBed.createComponent(HomeTrustStrip);
      fixture.detectChanges();
      const el = html(fixture);

      const titles = Array.from(el.querySelectorAll('.trust__text strong')).map((s) => s.textContent?.trim());
      expect(titles).toEqual(['Envío nacional', 'Retiro en tienda', 'Transferencia o WhatsApp', 'Instalación disponible']);
    });
  });

  describe('home-vehicles', () => {
    it('separa Auto Hub de Hub Market y muestra los últimos tres vehículos', async () => {
      const fixture = TestBed.createComponent(HomeVehicles);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = html(fixture);

      const doors = Array.from(el.querySelectorAll('.hv__door'));
      expect(doors.map((d) => d.getAttribute('href'))).toEqual(['/auto-hub', '/hub-market']);
      expect(doors[0].textContent).toContain('Verificados por X AutoHub');
      expect(doors[1].textContent).toContain('De la comunidad');
      expect(el.querySelectorAll('app-car-card').length).toBe(3);
    });

    it('sin vehículos publicados deja solo las dos puertas', () => {
      TestBed.configureTestingModule({
        providers: [{ provide: HubMarketService, useValue: { getLatestVehicles: () => of([]) } }],
      });
      const fixture = TestBed.createComponent(HomeVehicles);
      fixture.detectChanges();
      const el = html(fixture);

      expect(el.querySelector('.hv__latest')).toBeNull();
      expect(el.querySelectorAll('.hv__door').length).toBe(2);
    });
  });

  describe('home-community', () => {
    it('es una tarjeta que lleva a /social-hub, y nada más', () => {
      const fixture = TestBed.createComponent(HomeCommunity);
      fixture.detectChanges();
      const el = html(fixture);

      expect(el.querySelectorAll('a').length).toBe(1);
      expect(el.querySelector('a')?.getAttribute('href')).toBe('/social-hub');
    });
  });

  describe('la página Home', () => {
    it('arma los diez bloques en el orden del plan', () => {
      const fixture = TestBed.createComponent(Home);
      fixture.detectChanges();
      const tags = Array.from((fixture.nativeElement as HTMLElement).children).map((c) => c.tagName.toLowerCase());

      expect(tags).toEqual([
        'app-home-search',
        'app-home-categories',
        'app-home-vehicle-picker',
        'app-home-offers',
        'app-home-bestsellers',
        'app-home-new-arrivals',
        'app-home-services-banner',
        'app-home-trust-strip',
        'app-home-vehicles',
        'app-home-community',
      ]);
    });

    it('ya no trae el hero con video', () => {
      const fixture = TestBed.createComponent(Home);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('app-home-welcome')).toBeNull();
      expect(el.querySelector('video')).toBeNull();
    });
  });
});
