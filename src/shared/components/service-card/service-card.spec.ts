import { TestBed } from '@angular/core/testing';

import { ServiceCard } from './service-card';
import { SERVICES_MOCK } from '../../data/service.mock';
import { ServiceModel } from '../../models/service.model';

describe('ServiceCard', () => {
  function montar(service: ServiceModel) {
    const fixture = TestBed.createComponent(ServiceCard);
    fixture.componentRef.setInput('service', service);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const frenos = SERVICES_MOCK.find((s) => s.slug === 'frenos')!; // con precio
  const suspension = SERVICES_MOCK.find((s) => s.slug === 'suspension')!; // a cotizar

  it('con precio dice "Desde RD$ X"', () => {
    expect(montar(frenos).querySelector('.scard__price')?.textContent?.trim()).toBe('Desde RD$ 2,500');
  });

  it('sin precio dice "A cotizar", nunca RD$ 0', () => {
    const text = montar(suspension).querySelector('.scard__price')?.textContent?.trim();

    expect(text).toBe('A cotizar');
  });

  it('dice cuánto dura, como se lee', () => {
    expect(montar(frenos).querySelector('.scard__duration')?.textContent).toBe('1 h 30 min');
  });

  it('el título lleva al detalle', () => {
    expect(montar(frenos).querySelector('.scard__title a')?.getAttribute('href')).toBe('/servicios/frenos');
  });

  it('un servicio que se agenda ofrece "Agendar" con el servicio ya elegido', () => {
    const btn = montar(frenos).querySelector('.scard__btn')!;

    expect(btn.textContent?.trim()).toBe('Agendar');
    expect(btn.getAttribute('href')).toBe('/servicios/agendar?service=4');
  });

  it('uno que no se agenda ofrece "Cotizar"', () => {
    const btn = montar({ ...frenos, isBookable: false }).querySelector('.scard__btn')!;

    expect(btn.textContent?.trim()).toBe('Cotizar');
    expect(btn.getAttribute('href')).toBe('/servicios/cotizar?service=frenos');
  });
});
