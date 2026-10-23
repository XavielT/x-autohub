import { TestBed } from '@angular/core/testing';

import { ServiceWorks } from './service-works';
import { ServiceWorkModel } from '../../models/service.model';

describe('ServiceWorks', () => {
  const work = (over: Partial<ServiceWorkModel> = {}): ServiceWorkModel => ({
    id: 1, serviceId: 4, title: 'Cambio de discos', description: 'Discos nuevos', beforeImage: 'a.jpg', afterImage: 'b.jpg',
    vehicleText: 'Corolla 2015', doneAt: new Date('2026-09-12T12:00:00'), isPublished: true, ...over,
  });

  function montar(works: ServiceWorkModel[]) {
    const fixture = TestBed.createComponent(ServiceWorks);
    fixture.componentRef.setInput('works', works);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('con las dos fotos muestra antes y después', () => {
    const el = montar([work()]);

    expect([...el.querySelectorAll('figcaption')].map((c) => c.textContent)).toEqual(['Antes', 'Después']);
    expect(el.querySelector('.works__photos--single')).toBeNull();
  });

  it('con una sola foto muestra solo esa', () => {
    const el = montar([work({ beforeImage: null })]);

    expect([...el.querySelectorAll('figcaption')].map((c) => c.textContent)).toEqual(['Después']);
    expect(el.querySelector('.works__photos--single')).not.toBeNull();
  });

  it('sin fotos queda solo el texto', () => {
    const el = montar([work({ beforeImage: null, afterImage: null })]);

    expect(el.querySelector('.works__photos')).toBeNull();
    expect(el.textContent).toContain('Cambio de discos');
  });

  it('cada foto lleva su texto alternativo', () => {
    const el = montar([work()]);

    expect([...el.querySelectorAll('img')].map((i) => i.getAttribute('alt'))).toEqual([
      'Antes: Cambio de discos',
      'Después: Cambio de discos',
    ]);
  });

  it('dice el vehículo y cuándo', () => {
    const el = montar([work()]);

    expect(el.querySelector('.works__meta')?.textContent).toContain('Corolla 2015');
    expect(el.querySelector('time')).not.toBeNull();
  });
});
