import { TestBed } from '@angular/core/testing';

import { Thumb } from './thumb';

describe('Thumb', () => {
  function montar(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(Thumb);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('con foto, muestra la imagen', () => {
    const { el } = montar({ src: 'assets/imgs/x.jpg' });
    expect(el.querySelector('img')?.getAttribute('src')).toBe('assets/imgs/x.jpg');
  });

  it('sin foto ni máscara, muestra el icono de referencia', () => {
    const { el } = montar({ src: '', icon: 'tag' });
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('app-icon svg')).not.toBeNull();
  });

  it('sin foto y con SVG del sitio, lo pinta como máscara', () => {
    const { el } = montar({ src: null, mask: 'assets/icons/categories/frenos.svg' });
    expect(el.querySelector('.thumb__mask')).not.toBeNull();
    expect(el.querySelector('app-icon')).toBeNull();
  });

  it('si la foto no carga, cae al icono y no la reintenta', () => {
    const { fixture, el } = montar({ src: 'assets/imgs/rota.jpg', icon: 'package' });
    el.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('app-icon')).not.toBeNull();
  });

  it('una foto nueva se intenta aunque la anterior haya fallado', () => {
    const { fixture, el } = montar({ src: 'assets/imgs/rota.jpg' });
    el.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    fixture.componentRef.setInput('src', 'assets/imgs/buena.jpg');
    fixture.detectChanges();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('assets/imgs/buena.jpg');
  });

  it('el tamaño se aplica al contenedor', () => {
    const { el } = montar({ size: 56 });
    expect(el.style.width).toBe('56px');
  });
});
