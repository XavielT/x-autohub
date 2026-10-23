import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { of } from 'rxjs';

import { Servicio } from './servicio';
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { SERVICES_MOCK, WORKS_MOCK } from '../../../shared/data/service.mock';

describe('Servicio (/servicios/:slug)', () => {
  function montar(slug: string) {
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ slug })) } },
        {
          provide: ServiceCatalogService,
          useValue: {
            getBySlug: (s: string) => of(SERVICES_MOCK.find((x) => x.slug === s)),
            getWorks: (id: number) => of(WORKS_MOCK.filter((w) => w.serviceId === id)),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(Servicio);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('muestra el servicio: nombre, precio, duración y texto largo', () => {
    const { el } = montar('frenos');

    expect(el.querySelector('.svc__title')?.textContent).toBe('Frenos');
    expect(el.querySelector('.svc__price')?.textContent?.trim()).toBe('Desde RD$ 2,500');
    expect(el.querySelector('.svc__facts')?.textContent).toContain('1 h 30 min');
    expect(el.querySelector('.svc__body')?.textContent).toContain('sistema de frenos');
  });

  it('un servicio sin precio dice "A cotizar"', () => {
    expect(montar('suspension').el.querySelector('.svc__price')?.textContent?.trim()).toBe('A cotizar');
  });

  it('pone el título de la pestaña con el servicio', () => {
    montar('frenos');

    expect(TestBed.inject(Title).getTitle()).toBe('Frenos — Taller | X AutoHub');
  });

  it('ofrece agendar con el servicio ya elegido, cotizar y WhatsApp', () => {
    const { el } = montar('frenos');

    const links = [...el.querySelectorAll<HTMLAnchorElement>('.svc__actions a')];
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Agendar', 'Cotizar', 'WhatsApp']);
    expect(links[0].getAttribute('href')).toBe('/servicios/agendar?service=4');
    expect(links[1].getAttribute('href')).toBe('/servicios/cotizar?service=frenos');
    expect(links[2].href).toContain('wa.me/18099539782');
  });

  it('uno que no se agenda solo ofrece cotizar', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ slug: 'x' })) } },
        {
          provide: ServiceCatalogService,
          useValue: { getBySlug: () => of({ ...SERVICES_MOCK[0], isBookable: false }), getWorks: () => of([]) },
        },
      ],
    });
    const fixture = TestBed.createComponent(Servicio);
    fixture.detectChanges();

    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.svc__actions a')].map((a) => a.textContent?.trim());
    expect(labels).not.toContain('Agendar');
    expect(labels).toContain('Cotizar');
  });

  it('muestra los trabajos de ese tipo, y la sección no sale si no hay', () => {
    expect(montar('frenos').el.querySelector('#svc-works')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(montar('suspension').el.querySelector('#svc-works')).toBeNull();
  });

  it('un servicio que no existe lo dice y lleva al catálogo', () => {
    const { el } = montar('no-existe');

    expect(el.textContent).toContain('No encontramos este servicio');
    expect(el.querySelector('a[href="/servicios"].svc__btn')).not.toBeNull();
  });

  describe('reseñas y JSON-LD Service', () => {
    const ld = (): Record<string, unknown> | null => {
      const script = document.head.querySelector('script[data-ld="service"]');
      return script ? JSON.parse(script.textContent ?? '{}') : null;
    };

    afterEach(() => document.head.querySelectorAll('script[data-ld]').forEach((el) => el.remove()));

    async function listo(slug: string) {
      const m = montar(slug);
      await m.fixture.whenStable();
      m.fixture.detectChanges();
      await m.fixture.whenStable();
      m.fixture.detectChanges();
      return m;
    }

    it('el detalle trae el bloque de reseñas del servicio', async () => {
      const { el } = await listo('instalacion-de-accesorios');

      expect(el.querySelector('app-reviews')).not.toBeNull();
      expect(el.querySelector('.rv__count')?.textContent?.trim()).toBe('1 reseña');
    });

    it('un servicio con precio declara la oferta en DOP', async () => {
      await listo('frenos');

      expect(ld()).toMatchObject({
        '@type': 'Service',
        name: 'Frenos',
        url: 'https://xautohubrd.com/servicios/frenos',
        offers: { priceCurrency: 'DOP', price: '2500.00' },
      });
    });

    it('"A cotizar" no declara oferta: no es un precio', async () => {
      await listo('suspension');

      expect(ld()).not.toHaveProperty('offers');
    });

    it('sin reseñas no hay aggregateRating; con reseñas reales sí', async () => {
      await listo('frenos');
      expect(ld()).not.toHaveProperty('aggregateRating');

      TestBed.resetTestingModule();
      document.head.querySelectorAll('script[data-ld]').forEach((el) => el.remove());
      await listo('instalacion-de-accesorios');
      expect(ld()?.['aggregateRating']).toMatchObject({ ratingValue: 5, reviewCount: 1 });
    });

    it('un servicio que no existe no deja JSON-LD', async () => {
      await listo('no-existe');

      expect(ld()).toBeNull();
    });
  });
});
