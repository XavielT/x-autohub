import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AdminVersiones } from './admin-versiones';
import { ReleaseService } from '../../../../shared/services/release.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { ReleaseModel } from '../../../../shared/models/release.model';

const version = (n: number): ReleaseModel =>
  ({ id: n, version: `1.${n}.0`, releasedAt: new Date(2026, 0, n), title: n === 3 ? 'Buscador de cupones' : `Versión ${n}`, summary: '', userSummary: '', changes: [], isPublished: true }) as unknown as ReleaseModel;

describe('AdminVersiones (historial)', () => {
  async function montar(total: number) {
    const lista = Array.from({ length: total }, (_, i) => version(total - i));
    TestBed.configureTestingModule({
      providers: [
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: ReleaseService, useValue: { getAll: () => of(lista) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminVersiones);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('muestra las primeras 15 y deja ver más de a 15', async () => {
    const { c, fixture, el } = await montar(40);

    expect(el.querySelectorAll('.adm-rel__item')).toHaveLength(15);
    expect(el.querySelector('.adm-rel__more')?.textContent).toContain('40 en total'.replace('40', '25'));

    c.showMore();
    fixture.detectChanges();
    expect(el.querySelectorAll('.adm-rel__item')).toHaveLength(30);
  });

  it('con pocas versiones no hay botón de "ver más"', async () => {
    const { el } = await montar(5);
    expect(el.querySelectorAll('.adm-rel__item')).toHaveLength(5);
    expect(el.querySelector('.adm-rel__more')).toBeNull();
  });

  it('buscar llega a las antiguas, por versión o por título, sin acentos', async () => {
    const { c, fixture, el } = await montar(40);

    c.query.set('cupones');
    fixture.detectChanges();
    expect(c.shown().map((i) => i.id)).toEqual([3]);

    c.query.set('v1.40');
    expect(c.shown().map((i) => i.id)).toEqual([40]);

    c.query.set('zzz');
    fixture.detectChanges();
    expect(el.textContent).toContain('Ninguna versión coincide');
  });
});
