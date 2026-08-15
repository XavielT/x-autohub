import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AdminModeracion } from './admin-moderacion';
import { HubMarketService } from '../../../../shared/services/hub-market.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { HubMarketItemModel } from '../../../../shared/models/hub-market-item.model';

const PENDIENTE: HubMarketItemModel = {
  id: 501,
  title: 'Turbo Garrett GT2860',
  description: 'Turbo en buen estado, recien reparado.',
  images: ['assets/imgs/turbo.jpg'],
  price: 45000,
  location: 'Distrito Nacional',
  sellerName: 'Luis Mendez',
  sellerId: 'u-9',
  category: 'piezas',
  status: 'pendiente',
  detailRoute: '/hub-market-part-details/501',
  createdAt: '2026-08-10T10:00:00Z',
};

describe('AdminModeracion', () => {
  function montar(pendientes: HubMarketItemModel[] = [PENDIENTE]) {
    const moderate = vi.fn(() => of(undefined));
    const show = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: HubMarketService,
          useValue: { getPending: vi.fn(() => of(pendientes)), moderate },
        },
        { provide: ToastService, useValue: { show } },
      ],
    });

    const fixture = TestBed.createComponent(AdminModeracion);
    return { fixture, componente: fixture.componentInstance, moderate, show };
  }

  const texto = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('lista lo que espera revision, con lo que hace falta para decidir', async () => {
    const { fixture } = montar();
    await fixture.whenStable();
    const t = texto(fixture);

    expect(t).toContain('Turbo Garrett GT2860');
    expect(t).toContain('45,000');
    expect(t).toContain('Luis Mendez');
    expect(t).toContain('Distrito Nacional');
    expect(t).toContain('piezas');
  });

  it('dice cuando no hay nada pendiente, en vez de dejar la pantalla vacia', async () => {
    const { fixture } = montar([]);
    await fixture.whenStable();

    expect(texto(fixture)).toContain('No hay publicaciones pendientes.');
  });

  it('aprobar la publica y la saca de la cola', async () => {
    const { fixture, componente, moderate, show } = montar();
    await fixture.whenStable();

    componente.approve(PENDIENTE);
    await fixture.whenStable();

    expect(moderate).toHaveBeenCalledWith(501, 'aprobado', undefined);
    expect(componente.items()).toEqual([]);
    expect(show).toHaveBeenCalledWith('"Turbo Garrett GT2860" ya esta publicada.');
    expect(texto(fixture)).toContain('No hay publicaciones pendientes.');
  });

  it('el formulario de rechazo solo aparece al pedirlo', async () => {
    const { fixture, componente } = montar();
    await fixture.whenStable();

    expect(texto(fixture)).not.toContain('Motivo del rechazo');

    componente.askReject(PENDIENTE);
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Motivo del rechazo');
  });

  it('no rechaza sin motivo: es lo que le dice al vendedor que corregir', async () => {
    const { fixture, componente, moderate, show } = montar();
    await fixture.whenStable();

    componente.askReject(PENDIENTE);
    componente.reason.set('corto');
    componente.confirmReject(PENDIENTE);
    await fixture.whenStable();

    expect(moderate).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(
      'Explica en al menos 10 caracteres por que se rechaza.',
      'error',
    );
    // Y el error se ve junto al campo, no solo en el aviso.
    expect(componente.showReasonError).toBe(true);
    expect(texto(fixture)).toContain('Explica en al menos 10 caracteres');
  });

  it('un motivo de solo espacios tampoco cuenta', async () => {
    const { fixture, componente, moderate } = montar();
    await fixture.whenStable();

    componente.askReject(PENDIENTE);
    componente.reason.set('               ');
    componente.confirmReject(PENDIENTE);
    await fixture.whenStable();

    expect(moderate).not.toHaveBeenCalled();
  });

  it('rechaza con el motivo y lo manda recortado', async () => {
    const { fixture, componente, moderate, show } = montar();
    await fixture.whenStable();

    componente.askReject(PENDIENTE);
    componente.reason.set('  Las fotos no dejan ver el vehiculo completo.  ');
    componente.confirmReject(PENDIENTE);
    await fixture.whenStable();

    expect(moderate).toHaveBeenCalledWith(
      501,
      'rechazado',
      'Las fotos no dejan ver el vehiculo completo.',
    );
    expect(componente.items()).toEqual([]);
    expect(show).toHaveBeenCalledWith(
      '"Turbo Garrett GT2860" fue rechazada. El vendedor vera el motivo.',
    );
  });

  it('el error no se pinta antes del primer intento', async () => {
    const { fixture, componente } = montar();
    await fixture.whenStable();

    componente.askReject(PENDIENTE);
    await fixture.whenStable();

    // El campo esta vacio, pero todavia no se ha intentado nada.
    expect(componente.isReasonInvalid).toBe(true);
    expect(componente.showReasonError).toBe(false);
  });

  it('si la base rechaza la operacion, la tarjeta se queda en la cola', async () => {
    const { fixture, componente, show } = montar();
    await fixture.whenStable();
    // Se sustituye por una que falla, como haria un moderador degradado a la
    // mitad de la sesion: `moderate_publication()` responde 42501.
    const servicio = TestBed.inject(HubMarketService);
    servicio.moderate = vi.fn(() =>
      throwError(() => new Error('Solo un moderador o un administrador puede revisar publicaciones.')),
    );

    componente.approve(PENDIENTE);
    await fixture.whenStable();

    expect(componente.items().length).toBe(1);
    expect(show).toHaveBeenCalledWith(
      'Solo un moderador o un administrador puede revisar publicaciones.',
      'error',
    );
  });
});
