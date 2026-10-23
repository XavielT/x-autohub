import { TestBed } from '@angular/core/testing';

import { ImageGallery } from './image-gallery';

describe('ImageGallery', () => {
  const fotos = ['assets/imgs/a.jpg', 'assets/imgs/b.jpg', 'assets/imgs/c.jpg'];

  function montar(images: readonly string[] = fotos) {
    const fixture = TestBed.createComponent(ImageGallery);
    fixture.componentRef.setInput('images', images);
    fixture.componentRef.setInput('alt', 'Disco de freno');
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('muestra la primera foto con su alt y una miniatura por foto', () => {
    const { el } = montar();

    expect(el.querySelector('.gal__img')?.getAttribute('src')).toBe(fotos[0]);
    expect(el.querySelector('.gal__img')?.getAttribute('alt')).toBe('Disco de freno');
    expect(el.querySelectorAll('.gal__thumb').length).toBe(3);
  });

  it('con una sola foto no hay flechas ni miniaturas', () => {
    const { el } = montar([fotos[0]]);

    expect(el.querySelector('.gal__nav')).toBeNull();
    expect(el.querySelector('.gal__thumbs')).toBeNull();
  });

  it('las flechas dan la vuelta en los dos sentidos', () => {
    const { c } = montar();

    c.step(-1);
    expect(c.index()).toBe(2);
    c.step(1);
    expect(c.index()).toBe(0);
  });

  it('elegir una miniatura cambia la foto, y un indice fuera de rango se ignora', () => {
    const { fixture, c, el } = montar();

    c.select(2);
    fixture.detectChanges();
    expect(el.querySelector('.gal__img')?.getAttribute('src')).toBe(fotos[2]);

    c.select(9);
    expect(c.index()).toBe(2);
  });

  it('tocar la foto la amplia; Escape la cierra y las flechas del teclado la recorren', () => {
    const { fixture, c, el } = montar();

    c.openZoom();
    fixture.detectChanges();
    expect(el.querySelector('.gal__zoom')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(c.index()).toBe(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('.gal__zoom')).toBeNull();
  });

  it('si cambian las fotos vuelve a la primera y cierra el zoom', () => {
    const { fixture, c } = montar();
    c.select(2);
    c.openZoom();

    fixture.componentRef.setInput('images', ['assets/imgs/x.jpg', 'assets/imgs/y.jpg']);
    fixture.detectChanges();
    TestBed.tick();

    expect(c.index()).toBe(0);
    expect(c.isZoomed()).toBe(false);
  });

  describe('foto enfocada (la de la opción elegida)', () => {
    it('salta a esa foto', () => {
      const { fixture, c } = montar();

      fixture.componentRef.setInput('focus', fotos[2]);
      fixture.detectChanges();

      expect(c.index()).toBe(2);
    });

    it('cambiar de opción mueve la galería, y volver a una sin foto la deja donde estaba', () => {
      const { fixture, c } = montar();
      fixture.componentRef.setInput('focus', fotos[1]);
      fixture.detectChanges();

      fixture.componentRef.setInput('focus', null);
      fixture.detectChanges();
      expect(c.index()).toBe(1);

      fixture.componentRef.setInput('focus', fotos[2]);
      fixture.detectChanges();
      expect(c.index()).toBe(2);
    });

    it('una foto que no está en la galería no hace nada', () => {
      const { fixture, c } = montar();
      c.select(1);

      fixture.componentRef.setInput('focus', 'assets/imgs/otra.jpg');
      fixture.detectChanges();

      expect(c.index()).toBe(1);
    });

    it('si cambian las fotos (otro producto), vuelve a la primera', () => {
      const { fixture, c } = montar();
      fixture.componentRef.setInput('focus', fotos[2]);
      fixture.detectChanges();

      fixture.componentRef.setInput('focus', null);
      fixture.componentRef.setInput('images', ['assets/imgs/x.jpg', 'assets/imgs/y.jpg']);
      fixture.detectChanges();

      expect(c.index()).toBe(0);
    });
  });
});
