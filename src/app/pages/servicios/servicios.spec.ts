import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { Servicios } from './servicios';
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { SiteSettingsService } from '../../../shared/services/site-settings.service';
import { AVAILABILITY_MOCK, SERVICES_MOCK, WORKS_MOCK } from '../../../shared/data/service.mock';

describe('Servicios (/servicios)', () => {
  const real = { address: 'Av. Principal 1, Santiago', hours: '', isExample: false };

  function montar(options: { works?: typeof WORKS_MOCK; pickup?: unknown; fail?: boolean } = {}) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ServiceCatalogService,
          useValue: {
            getServices: () => (options.fail ? throwError(() => new Error('caido')) : of(SERVICES_MOCK)),
            getWorks: () => of(options.works ?? []),
            getAvailability: () => of(AVAILABILITY_MOCK),
          },
        },
        { provide: SiteSettingsService, useValue: { getPickupAddress: () => of(options.pickup ?? null) } },
      ],
    });
    const fixture = TestBed.createComponent(Servicios);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('arriba hay dos botones grandes: cotizar por WhatsApp y agendar', () => {
    const { el } = montar();

    const buttons = [...el.querySelectorAll<HTMLAnchorElement>('.srv__cta a')];
    expect(buttons.map((a) => a.textContent?.trim())).toEqual(['Cotizar por WhatsApp', 'Agendar cita']);
    expect(buttons[0].href).toContain('wa.me/18099539782');
    expect(buttons[1].getAttribute('href')).toBe('/servicios/agendar');
  });

  it('el catálogo se agrupa por categoría, en el orden fijo, y cada servicio tiene su tarjeta', () => {
    const { el, c } = montar();

    expect(c.groups().map((g) => g.category)).toEqual([
      'instalacion', 'mantenimiento', 'mecanica', 'electrico', 'aire_acondicionado', 'diagnostico',
    ]);
    expect(el.querySelectorAll('app-service-card')).toHaveLength(10);
    expect(el.querySelector('#cat-mecanica')?.textContent).toContain('Mecánica ligera');
  });

  it('una categoría sin servicios no sale', () => {
    const { c } = montar();
    c.services.set(SERVICES_MOCK.filter((s) => s.category === 'mecanica'));

    expect(c.groups().map((g) => g.category)).toEqual(['mecanica']);
  });

  it('sin trabajos publicados no se pinta la sección', () => {
    expect(montar({ works: [] }).el.querySelector('#srv-works')).toBeNull();
  });

  it('con trabajos publicados se pinta "Trabajos realizados"', () => {
    const { el } = montar({ works: WORKS_MOCK });

    expect(el.querySelector('#srv-works')?.textContent).toContain('Trabajos realizados');
    expect(el.querySelectorAll('.works__item')).toHaveLength(WORKS_MOCK.length);
  });

  it('dice sin rodeos lo que no se hace', () => {
    expect(montar().el.querySelector('.srv__nope')?.textContent).toContain('mecánica pesada');
  });

  it('el horario se lee en tramos', () => {
    const { el } = montar();

    const lines = [...el.querySelectorAll('.srv__hours li')].map((l) => l.textContent?.replace(/\s+/g, ' ').trim());
    expect(lines).toEqual(['Lun – Vie 8:00 a. m. – 5:00 p. m.', 'Sáb 8:00 a. m. – 1:00 p. m.']);
  });

  it('una dirección real se muestra; una de ejemplo no se le enseña a nadie', () => {
    expect(montar({ pickup: real }).el.querySelector('.srv__contact')?.textContent).toContain('Av. Principal 1');
    TestBed.resetTestingModule();

    const example = montar({ pickup: { ...real, isExample: true } });
    expect(example.el.querySelector('.srv__contact')?.textContent).not.toContain('Av. Principal 1');
    expect(example.el.querySelector('.srv__contact')?.textContent).toContain('Te confirmamos la dirección');
  });

  it('si falla el catálogo lo dice, y el contacto sigue ahí', () => {
    const { el } = montar({ fail: true });

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar los servicios');
    expect(el.querySelector('.srv__contact')).not.toBeNull();
  });
});
