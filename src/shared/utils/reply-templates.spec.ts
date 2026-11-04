import { appointmentReplyDraft, firstName, orderReplyDraft, quoteReplyDraft, scheduleLinkDraft, waLinkFor } from './reply-templates';

describe('reply-templates', () => {
  it('firstName saca el primer nombre con mayúscula inicial', () => {
    expect(firstName('  maria PEREZ ')).toBe('Maria');
    expect(firstName('')).toBe('');
  });

  it('la respuesta a una solicitud lleva el código y pide lo que falta', () => {
    const msg = quoteReplyDraft({ name: 'Maria Perez', code: 'XAH-C-0007', missingInfo: ['¿Desde cuándo pasa?', ' '] });

    expect(msg).toContain('Hola Maria, te escribimos de X AutoHub.');
    expect(msg).toContain('Recibimos tu solicitud XAH-C-0007.');
    expect(msg).toContain('• ¿Desde cuándo pasa?');
    expect(msg.split('•').length).toBe(2);
  });

  it('sin nada que preguntar, dice que ya la revisan', () => {
    expect(quoteReplyDraft({ name: '', code: 'XAH-C-0001' })).toContain('Ya la estamos revisando');
    expect(quoteReplyDraft({ name: '', code: 'XAH-C-0001' })).toMatch(/^Hola, te escribimos/);
  });

  it('el enlace para agendar va en el mensaje', () => {
    expect(scheduleLinkDraft({ name: 'Ana', code: 'XAH-C-0002', link: 'https://xautohubrd.com/servicios/agendar?service=3' })).toContain('agendar?service=3');
  });

  it('waLinkFor abre wa.me al teléfono del cliente con el texto codificado', () => {
    const link = waLinkFor('8095550134', 'Hola & adiós');

    expect(link).toContain('wa.me/18095550134');
    expect(link).toContain(encodeURIComponent('Hola & adiós'));
  });

  describe('pedidos y citas (respaldo sin IA)', () => {
    it('cada estado del pedido dice lo que toca', () => {
      expect(orderReplyDraft({ name: 'Maria', orderNumber: 1042, status: 'paid' })).toContain('Ya recibimos el pago de tu pedido #1042');
      expect(orderReplyDraft({ name: 'Maria', orderNumber: 1042, status: 'ready_for_pickup' })).toContain('pasar a retirarlo');
      expect(orderReplyDraft({ name: 'Maria', orderNumber: 1042, status: 'shipped' })).toContain('va en camino');
    });

    it('un comprobante ilegible pide reenviarlo, más claro', () => {
      const msg = orderReplyDraft({ name: 'Maria', orderNumber: 1042, status: 'awaiting_payment', proofUnreadable: true });

      expect(msg).toContain('No pudimos leer bien el comprobante');
      expect(msg).toContain('de nuevo');
    });

    it('esperando pago sin comprobante ilegible: seguimos esperando', () => {
      expect(orderReplyDraft({ name: '', orderNumber: 7, status: 'awaiting_payment' })).toContain('Seguimos esperando');
    });

    it('un estado desconocido no rompe: un mensaje genérico con el número', () => {
      expect(orderReplyDraft({ name: 'Ana', orderNumber: 9, status: 'raro' })).toContain('pedido #9');
    });

    it('la cita confirmada lleva el servicio y la hora', () => {
      const msg = appointmentReplyDraft({ name: 'Juan', number: 2001, service: 'Alineación', when: 'jueves 5, 10:30 a. m.', status: 'confirmed' });

      expect(msg).toContain('cita #2001');
      expect(msg).toContain('Alineación');
      expect(msg).toContain('jueves 5, 10:30 a. m.');
    });
  });
});
