import { TestBed } from '@angular/core/testing';
import { VehicleCard } from './vehicle-card';

describe('VehicleCard', () => {
  function montar(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(VehicleCard);
    fixture.componentRef.setInput('link', '/car-details/1');
    fixture.componentRef.setInput('title', 'Toyota Corolla');
    fixture.componentRef.setInput('price', 130000);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('el precio va completo, con RD$ y miles, en su propia fila', () => {
    const el = montar({});
    expect(el.querySelector('.vcard__price')?.textContent?.trim()).toBe('RD$ 130,000');
  });

  it('año y kilometraje salen juntos; sin ellos no hay línea', () => {
    expect(montar({ year: 2015, mileage: 92000 }).querySelector('.vcard__sub')?.textContent).toContain('2015');
    expect(montar({ year: 2015, mileage: 92000 }).querySelector('.vcard__sub')?.textContent).toContain('92,000 km');
    expect(montar({}).querySelector('.vcard__sub')).toBeNull();
  });

  it('las especificaciones van en columnas iguales, una por dato', () => {
    const el = montar({ specs: [{ label: 'HP', value: '200 HP' }, { label: '0-100', value: '6 s' }, { label: 'Vel. máx.', value: '220 km/h' }] });
    expect(el.querySelectorAll('.vcard__spec').length).toBe(3);
    expect(el.querySelector('.vcard__spec dt')?.textContent).toBe('HP');
  });

  it('muestra la etiqueta sobre la imagen solo si hay', () => {
    expect(montar({ badge: 'Verificado por X AutoHub' }).querySelector('.vcard__media .vcard__badge')?.textContent).toContain('Verificado por X AutoHub');
    expect(montar({}).querySelector('.vcard__badge')).toBeNull();
  });

  it('sin foto cae al SVG genérico', () => {
    const el = montar({ image: null });
    expect(el.querySelector('img')?.getAttribute('src')).toBe('assets/icons/auto-icon.svg');
  });

  it('una data URL no pasa por NgOptimizedImage', () => {
    const el = montar({ image: 'data:image/png;base64,AAAA' });
    expect(el.querySelector('img')?.getAttribute('src')).toContain('data:image/png');
  });

  it('un solo enlace envuelve la imagen y otro el nombre', () => {
    const el = montar({});
    expect(el.querySelectorAll('a').length).toBe(2);
  });
});
