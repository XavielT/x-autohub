import { quoteLink, quoteMessage } from './quote-message';

describe('quote-message', () => {
  it('arma el mensaje con el servicio, el vehículo, lo que necesita y el teléfono', () => {
    const msg = quoteMessage({
      serviceTitle: 'Frenos',
      vehicle: 'Toyota Corolla 2015',
      details: 'Hace un ruido al frenar',
      phone: '809-555-0134',
    });

    expect(msg).toBe(
      [
        'Hola X AutoHub, quiero cotizar: Frenos.',
        'Vehículo: Toyota Corolla 2015',
        'Qué necesito: Hace un ruido al frenar',
        'Mi teléfono: 809-555-0134',
      ].join('\n'),
    );
  });

  it('sin servicio pide cotizar "un servicio"', () => {
    expect(quoteMessage({ vehicle: '', details: 'algo', phone: '' })).toMatch(/quiero cotizar un servicio/);
  });

  it('lo que está vacío no deja una línea vacía', () => {
    const msg = quoteMessage({ vehicle: '  ', details: 'Aire sin enfriar', phone: '' });

    expect(msg).not.toContain('Vehículo');
    expect(msg).not.toContain('teléfono');
    expect(msg.split('\n')).toHaveLength(2);
  });

  it('recorta los espacios', () => {
    expect(quoteMessage({ vehicle: '  Civic  ', details: ' falla ', phone: '' })).toContain('Vehículo: Civic');
  });

  it('las fotos no viajan: el mensaje solo dice cuántas va a mandar por el chat', () => {
    expect(quoteMessage({ vehicle: '', details: 'x', phone: '', photos: 1 })).toContain('Te mando una foto por aquí.');
    expect(quoteMessage({ vehicle: '', details: 'x', phone: '', photos: 3 })).toContain('Te mando 3 fotos por aquí.');
    expect(quoteMessage({ vehicle: '', details: 'x', phone: '', photos: 0 })).not.toContain('foto');
  });

  it('el enlace va al número de la tienda con el texto codificado', () => {
    const link = quoteLink({ vehicle: 'Civic', details: 'Ruido & vibración', phone: '' });

    expect(link).toContain('wa.me/18099539782');
    expect(link).toContain(encodeURIComponent('Ruido & vibración'));
    expect(link).not.toContain('Ruido & vibración'); // el & sin codificar cortaría el mensaje
  });
});
