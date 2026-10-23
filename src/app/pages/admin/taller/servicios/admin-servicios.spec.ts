import { TestBed } from '@angular/core/testing';

import { AdminServicios, SERVICE_ICONS } from './admin-servicios';
import { ToastService } from '../../../../../shared/services/toast.service';

describe('AdminServicios', () => {
  const toast = { show: vi.fn() };

  async function montar() {
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: toast }] });
    const fixture = TestBed.createComponent(AdminServicios);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const input = (value: string) => ({ target: { value, checked: value === 'true' } }) as unknown as Event;

  beforeEach(() => toast.show.mockReset());

  it('lista los diez servicios, con precio o "a cotizar"', async () => {
    const { c, el } = await montar();

    expect(c.services()).toHaveLength(10);
    const text = el.textContent ?? '';
    expect(text).toContain('desde RD$ 2,500');
    expect(text).toContain('a cotizar');
  });

  it('"Nuevo servicio" abre un formulario en blanco al final del orden, a cotizar y visible', async () => {
    const { c } = await montar();

    c.newService();

    const d = c.draft()!;
    expect(d.id).toBeNull();
    expect(d.priceFrom).toBeNull();
    expect(d.isActive).toBe(true);
    expect(d.isBookable).toBe(true);
    expect(d.sortOrder).toBe(110); // el último es 100
  });

  it('el precio vacío es "a cotizar" (null), no 0', async () => {
    const { c } = await montar();
    c.newService();

    c.setPrice(input('1500'));
    expect(c.draft()!.priceFrom).toBe(1500);

    c.setPrice(input('  '));
    expect(c.draft()!.priceFrom).toBeNull();
  });

  it('sin nombre no guarda, y lo dice', async () => {
    const { c } = await montar();
    c.newService();

    c.save();

    expect(toast.show).toHaveBeenCalledWith('Escribe el nombre del servicio.', 'error');
    expect(c.draft()).not.toBeNull();
  });

  it('crea un servicio, cierra el formulario y lo muestra en la lista', async () => {
    const { c } = await montar();
    c.newService();
    c.setText('title', input('Alineación y balanceo'));
    c.setText('description', input('Alineación 3D'));

    c.save();

    expect(c.draft()).toBeNull();
    expect(toast.show).toHaveBeenCalledWith('Servicio "Alineación y balanceo" guardado.');
    expect(c.services().some((s) => s.slug === 'alineacion-y-balanceo')).toBe(true);
  });

  it('editar precarga el servicio y guarda los cambios', async () => {
    const { c } = await montar();
    const frenos = c.services().find((s) => s.slug === 'frenos')!;

    c.edit(frenos);
    expect(c.draft()!.title).toBe('Frenos');
    c.setPrice(input('3000'));
    c.save();

    expect(c.services().find((s) => s.id === frenos.id)!.priceFrom).toBe(3000);
  });

  it('apagar un servicio lo deja en la lista pero marcado', async () => {
    const { c, fixture, el } = await montar();
    const frenos = c.services().find((s) => s.slug === 'frenos')!;

    c.toggleActive(frenos);
    fixture.detectChanges();

    expect(c.services().find((s) => s.id === frenos.id)!.isActive).toBe(false);
    expect(el.querySelectorAll('.tl__card.is-off')).toHaveLength(1);
    expect(toast.show).toHaveBeenCalledWith('"Frenos" apagado.');
  });

  it('cancelar cierra el formulario sin guardar', async () => {
    const { c } = await montar();
    c.newService();

    c.cancel();

    expect(c.draft()).toBeNull();
  });

  it('quitar una foto la saca del borrador', async () => {
    const { c } = await montar();
    c.newService();
    c.draft.update((d) => ({ ...d!, images: ['a.jpg', 'b.jpg'] }));

    c.removeImage(0);

    expect(c.draft()!.images).toEqual(['b.jpg']);
  });

  it('solo ofrece los iconos que existen en assets/icons', () => {
    expect(SERVICE_ICONS.every((i) => i.value.startsWith('assets/icons/') && i.value.endsWith('.svg'))).toBe(true);
  });
});
