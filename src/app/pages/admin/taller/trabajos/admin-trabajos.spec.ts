import { TestBed } from '@angular/core/testing';

import { AdminTrabajos } from './admin-trabajos';
import { ToastService } from '../../../../../shared/services/toast.service';

describe('AdminTrabajos', () => {
  const toast = { show: vi.fn() };

  async function montar() {
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: toast }] });
    const fixture = TestBed.createComponent(AdminTrabajos);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const text = (value: string) => ({ target: { value } }) as unknown as Event;

  beforeEach(() => toast.show.mockReset());

  it('lista los trabajos con su estado y su servicio', async () => {
    const { c, el } = await montar();

    expect(c.works().length).toBeGreaterThanOrEqual(2);
    expect(el.textContent).toContain('Publicado');
    expect(c.serviceTitle(4)).toBe('Frenos');
    expect(c.serviceTitle(null)).toBe('Sin servicio');
  });

  it('un trabajo nuevo nace como borrador, de hoy', async () => {
    const { c } = await montar();

    c.newWork();

    expect(c.draft()).toMatchObject({ id: null, isPublished: false, afterImage: null });
    expect(c.draft()!.doneAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('sin título no se guarda', async () => {
    const { c } = await montar();
    c.newWork();

    c.save();

    expect(toast.show).toHaveBeenCalledWith('Escribe el título del trabajo.', 'error');
  });

  it('para publicar hace falta la foto del después', async () => {
    const { c } = await montar();
    c.newWork();
    c.setText('title', text('Cambio de pastillas'));
    c.setPublished({ target: { checked: true } } as unknown as Event);

    c.save();

    expect(toast.show).toHaveBeenCalledWith('Para publicar hace falta al menos la foto del después.', 'error');
    expect(c.draft()).not.toBeNull();
  });

  it('un borrador sin fotos sí se guarda', async () => {
    const { c } = await montar();
    c.newWork();
    c.setText('title', text('Revisión'));

    c.save();

    expect(c.draft()).toBeNull();
    expect(toast.show).toHaveBeenCalledWith('"Revisión" guardado como borrador.');
    expect(c.works().some((w) => w.title === 'Revisión' && !w.isPublished)).toBe(true);
  });

  it('con la foto del después elegida se puede publicar, y la foto se sube al guardar', async () => {
    const { c } = await montar();
    c.newWork();
    c.setText('title', text('Batería nueva'));
    c.setPublished({ target: { checked: true } } as unknown as Event);
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'despues.jpg', { type: 'image/jpeg' })] });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');

    c.onPhoto('after', { target: input } as unknown as Event);
    expect(c.afterPreview()).toBe('blob:preview');
    c.save();

    const saved = c.works().find((w) => w.title === 'Batería nueva')!;
    expect(saved.isPublished).toBe(true);
    expect(saved.afterImage).toBeTruthy();
  });

  it('un archivo que no es una foto se rechaza antes de elegirlo', async () => {
    const { c } = await montar();
    c.newWork();
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] });

    c.onPhoto('before', { target: input } as unknown as Event);

    expect(toast.show.mock.calls.at(-1)?.[1]).toBe('error');
    expect(c.beforePreview()).toBeNull();
  });

  it('publicar y despublicar sin abrir el formulario', async () => {
    const { c } = await montar();
    const published = c.works().find((w) => w.isPublished)!;

    c.togglePublished(published);

    expect(c.works().find((w) => w.id === published.id)!.isPublished).toBe(false);
    expect(toast.show).toHaveBeenCalledWith('Trabajo despublicado.');
  });

  it('borrar pide un segundo toque', async () => {
    const { c } = await montar();
    const first = c.works()[0];
    const before = c.works().length;

    c.remove(first);
    expect(c.works()).toHaveLength(before);
    expect(c.confirmDeleteId()).toBe(first.id);

    c.remove(first);
    expect(c.works()).toHaveLength(before - 1);
  });

  it('quitar una foto la saca del borrador y de la vista previa', async () => {
    const { c } = await montar();
    c.edit(c.works().find((w) => w.afterImage)!);

    c.removePhoto('after');

    expect(c.draft()!.afterImage).toBeNull();
    expect(c.afterPreview()).toBeNull();
  });
});
