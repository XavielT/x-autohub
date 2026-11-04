import { TestBed } from '@angular/core/testing';

import { AdminSolicitudes } from './admin-solicitudes';
import { QuoteRequest } from '../../../../../shared/services/quote.service';

const req = (extra: Partial<QuoteRequest>): QuoteRequest => ({
  id: 'x', code: 'XAH-C-0001', name: 'Maria Perez', phone: '8095550134', vehicleText: null, serviceId: null, description: 'Ruido', photos: [],
  status: 'nueva', urgency: null, triage: null, createdAt: new Date(), ...extra,
});

describe('AdminSolicitudes', () => {
  function montar() {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(AdminSolicitudes);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('se crea y en modo simulado no hay solicitudes', () => {
    const { c, el } = montar();

    expect(c.requests()).toEqual([]);
    expect(el.textContent).toContain('No hay solicitudes');
  });

  it('las de seguridad van primero, luego las nuevas; "activas" no trae las cerradas ni el spam', () => {
    const { c } = montar();
    c.requests.set([
      req({ id: 'a', status: 'respondida' }),
      req({ id: 'b', status: 'nueva' }),
      req({ id: 'c', status: 'vista', urgency: 'seguridad' }),
      req({ id: 'd', status: 'cerrada' }),
      req({ id: 'e', status: 'spam' }),
    ]);

    expect(c.shown().map((r) => r.id)).toEqual(['c', 'b', 'a']);
    c.setFilter('cerrada');
    expect(c.shown().map((r) => r.id)).toEqual(['d']);
  });

  it('"Responder por WhatsApp" abre el chat del cliente con el código y lo que falta preguntar (sin mandar nada solo)', () => {
    const { c } = montar();
    const link = decodeURIComponent(c.replyLink(req({ triage: { services: [], summary: '', missing_info: ['¿Desde cuándo pasa?'], checklist: [], checklist_note: '', can_quote_without_inspection: false } })));

    expect(link).toContain('wa.me/18095550134');
    expect(link).toContain('Recibimos tu solicitud XAH-C-0001.');
    expect(link).toContain('¿Desde cuándo pasa?');
  });

  it('"Enviar enlace para agendar" lleva el servicio ya elegido', () => {
    const { c } = montar();
    c.services.set([{ id: 4, slug: 'frenos', title: 'Frenos' } as never]);

    const link = decodeURIComponent(c.scheduleLink(req({ serviceId: 4 })));

    expect(link).toContain('/servicios/agendar?service=4');
  });

  it('sin servicio claro, el enlace es el de agendar a secas', () => {
    expect(decodeURIComponent(montar().c.scheduleLink(req({})))).toContain('/servicios/agendar');
  });
});
