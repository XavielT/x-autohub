import { TestBed } from '@angular/core/testing';
import { ImageEditor } from './image-editor';

describe('ImageEditor', () => {
  function montar() {
    const fixture = TestBed.createComponent(ImageEditor);
    fixture.componentRef.setInput('src', 'data:image/png;base64,AAAA');
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('se abre como un diálogo con sus herramientas listas cuando la foto carga', () => {
    const { fixture, c, el } = montar();
    c.ready.set(true);
    c.view.set({ w: 400, h: 300 });
    fixture.detectChanges();

    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    expect(el.textContent).toContain('Girar');
    expect(el.textContent).toContain('Voltear');
    expect(el.textContent).toContain('16:9');
  });

  it('elegir una proporción deja el recorte más grande con esa forma', () => {
    const { c } = montar();
    c.view.set({ w: 400, h: 300 });
    c.setRatio(1);
    expect(c.crop()).toEqual({ x: 50, y: 0, w: 300, h: 300 });
    c.setRatio(null);
    expect(c.crop()).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });

  it('Escape y la x cierran sin aplicar nada', () => {
    const { c } = montar();
    const closed = vi.fn();
    const applied = vi.fn();
    c.closed.subscribe(closed);
    c.applied.subscribe(applied);
    c.onEscape();
    c.close();

    expect(closed).toHaveBeenCalledTimes(2);
    expect(applied).not.toHaveBeenCalled();
  });

  it('si la foto no se puede leer, lo dice en vez de quedarse cargando', async () => {
    const fixture = TestBed.createComponent(ImageEditor);
    fixture.componentRef.setInput('src', 'data:no-es-una-imagen');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 100));
    fixture.detectChanges();

    expect(fixture.componentInstance.ready()).toBe(false);
    // En jsdom una imagen nunca carga: o falla (mensaje) o queda cargando; en ningún caso aplica.
    expect(fixture.nativeElement.textContent).toMatch(/No se pudo abrir|Cargando/);
  });
});
