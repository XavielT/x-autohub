import { TestBed } from '@angular/core/testing';
import { JsonLdService } from './json-ld.service';

describe('JsonLdService', () => {
  const blocks = (key: string) => document.head.querySelectorAll(`script[data-ld="${key}"]`);

  afterEach(() => document.head.querySelectorAll('script[data-ld]').forEach((el) => el.remove()));

  it('agrega un bloque application/ld+json al head', () => {
    TestBed.inject(JsonLdService).set('product', { '@type': 'Product', name: 'Disco' });

    const [script] = Array.from(blocks('product')) as HTMLScriptElement[];
    expect(script.type).toBe('application/ld+json');
    expect(JSON.parse(script.textContent ?? '')).toEqual({ '@type': 'Product', name: 'Disco' });
  });

  it('poner la misma clave otra vez reemplaza el bloque, no lo duplica', () => {
    const service = TestBed.inject(JsonLdService);
    service.set('product', { name: 'Uno' });
    service.set('product', { name: 'Dos' });

    expect(blocks('product')).toHaveLength(1);
    expect(JSON.parse(blocks('product')[0].textContent ?? '').name).toBe('Dos');
  });

  it('null quita el bloque, y quitar uno que no existe no falla', () => {
    const service = TestBed.inject(JsonLdService);
    service.set('product', { name: 'Uno' });

    service.set('product', null);
    expect(blocks('product')).toHaveLength(0);
    expect(() => service.set('product', null)).not.toThrow();
  });

  it('claves distintas conviven (producto y servicio)', () => {
    const service = TestBed.inject(JsonLdService);
    service.set('product', { a: 1 });
    service.set('service', { b: 2 });

    expect(blocks('product')).toHaveLength(1);
    expect(blocks('service')).toHaveLength(1);
  });

  it('un "<" en un texto no puede cerrar el script', () => {
    TestBed.inject(JsonLdService).set('product', { name: '</script><img src=x onerror=alert(1)>' });

    expect(blocks('product')[0].textContent).not.toContain('<');
    expect(document.head.querySelector('img')).toBeNull();
  });
});
