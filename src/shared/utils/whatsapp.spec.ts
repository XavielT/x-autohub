import { buildWaLink, toWaDigits } from './whatsapp';

describe('toWaDigits', () => {
  it('antepone el 1 de RD a un numero local de diez digitos', () => {
    expect(toWaDigits('809 555 0134')).toBe('18095550134');
    expect(toWaDigits('8095550134')).toBe('18095550134');
    expect(toWaDigits('(829) 555-0187')).toBe('18295550187');
  });

  it('respeta el codigo de pais que ya viene', () => {
    expect(toWaDigits('+1 809-555-0134')).toBe('18095550134');
    expect(toWaDigits('+18095550134')).toBe('18095550134');
    // Extranjero: no se le suma un 1 encima.
    expect(toWaDigits('+34 600 123 456')).toBe('34600123456');
  });

  it('sin digitos no hay nada que devolver', () => {
    expect(toWaDigits('')).toBe('');
    expect(toWaDigits('llamar al taller')).toBe('');
  });
});

describe('buildWaLink', () => {
  it('arma el enlace con el numero en E.164', () => {
    expect(buildWaLink('809 555 0134', 'Hola')).toBe('https://wa.me/18095550134?text=Hola');
  });

  it('codifica el mensaje: espacios, acentos y comillas', () => {
    const link = buildWaLink('8095550134', 'Hola! Vi tu publicacion "Toyota Supra MK4" en X AutoHub.');

    expect(link).toBe(
      'https://wa.me/18095550134?text=' +
        'Hola!%20Vi%20tu%20publicacion%20%22Toyota%20Supra%20MK4%22%20en%20X%20AutoHub.',
    );
    // El texto sobrevive el viaje de ida y vuelta.
    expect(decodeURIComponent(link.split('?text=')[1])).toContain('"Toyota Supra MK4"');
  });

  it('codifica el & de un titulo, que si no cortaria el mensaje', () => {
    const link = buildWaLink('8095550134', 'Kit A & B');

    expect(link).toContain('%26');
    expect(link).not.toContain('& B');
  });

  it('devuelve cadena vacia sin telefono, para que la plantilla no pinte el boton', () => {
    expect(buildWaLink('', 'Hola')).toBe('');
    expect(buildWaLink('sin numero', 'Hola')).toBe('');
  });
});
