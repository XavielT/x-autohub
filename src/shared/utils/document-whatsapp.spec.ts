import { documentWhatsAppLink, documentWhatsAppMessage } from './document-whatsapp';

const quote = { kind: 'cotizacion' as const, code: 'COT-0007', customerName: 'Juan Pérez', customerPhone: '809 555 0134', total: 12500, validUntil: '2026-12-11', balance: 0 };

describe('mensaje de WhatsApp de un documento', () => {
  it('la cotización dice el código, el total y hasta cuándo vale', () => {
    const m = documentWhatsAppMessage(quote, 'X AutoHub');
    expect(m).toContain('Hola Juan');
    expect(m).toContain('COT-0007');
    expect(m).toContain('12,500.00');
    expect(m).toContain('11/12/2026');
  });

  it('una cotización con conceptos a determinar avisa que el monto no los incluye', () => {
    expect(documentWhatsAppMessage({ ...quote, pending: 2 }, 'X AutoHub')).toContain('a determinar');
    expect(documentWhatsAppMessage(quote, 'X AutoHub')).not.toContain('a determinar');
  });

  it('la factura con saldo dice cuánto queda y saldada lo dice también', () => {
    const f = { ...quote, kind: 'factura' as const, code: 'FAC-0003', validUntil: null, balance: 2500 };
    expect(documentWhatsAppMessage(f, 'X AutoHub')).toContain('pendiente');
    expect(documentWhatsAppMessage({ ...f, balance: 0 }, 'X AutoHub')).toContain('saldada');
  });

  it('el enlace va al teléfono del cliente en formato internacional y vacío si no hay teléfono', () => {
    expect(documentWhatsAppLink(quote, 'X AutoHub')).toContain('wa.me/18095550134');
    expect(documentWhatsAppLink({ ...quote, customerPhone: '' }, 'X AutoHub')).toBe('');
  });
});
