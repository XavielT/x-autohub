import { FormControl } from '@angular/forms';
import {
  digitsOnly,
  drPhoneValidator,
  formatDrPhone,
  isValidDrPhone,
  normalizeDrPhone,
} from './phone';

describe('digitsOnly', () => {
  it('deja solo los digitos', () => {
    expect(digitsOnly('+1 (809) 555-0134')).toBe('18095550134');
    expect(digitsOnly('sin numeros')).toBe('');
  });
});

describe('normalizeDrPhone', () => {
  it('acepta las tres formas en que se escribe el mismo numero', () => {
    expect(normalizeDrPhone('809 555 0134')).toBe('8095550134');
    expect(normalizeDrPhone('8095550134')).toBe('8095550134');
    expect(normalizeDrPhone('+18095550134')).toBe('8095550134');
  });

  it('tolera guiones, parentesis y espacios de mas', () => {
    expect(normalizeDrPhone('(809) 555-0134')).toBe('8095550134');
    expect(normalizeDrPhone('  809-555-0134  ')).toBe('8095550134');
    expect(normalizeDrPhone('+1 809-555-0134')).toBe('8095550134');
  });

  it('acepta los tres codigos de area dominicanos', () => {
    expect(normalizeDrPhone('8295550134')).toBe('8295550134');
    expect(normalizeDrPhone('8495550134')).toBe('8495550134');
  });

  it('rechaza lo que no es un telefono', () => {
    expect(normalizeDrPhone('')).toBeNull();
    expect(normalizeDrPhone('123')).toBeNull();
    expect(normalizeDrPhone('no es un telefono')).toBeNull();
    // Nueve digitos: uno de menos.
    expect(normalizeDrPhone('809555013')).toBeNull();
    // Doce digitos sin un codigo de pais que los explique.
    expect(normalizeDrPhone('809555013412')).toBeNull();
  });

  it('rechaza codigos de area y de central invalidos en el NANP', () => {
    expect(normalizeDrPhone('0095550134')).toBeNull();
    expect(normalizeDrPhone('1095550134')).toBeNull();
    // Central que empieza en 1.
    expect(normalizeDrPhone('8091550134')).toBeNull();
    expect(normalizeDrPhone('0000000000')).toBeNull();
  });
});

describe('isValidDrPhone', () => {
  it('es la contraparte booleana de normalizeDrPhone', () => {
    expect(isValidDrPhone('809 555 0134')).toBe(true);
    expect(isValidDrPhone('nada')).toBe(false);
    expect(isValidDrPhone('')).toBe(false);
  });
});

describe('formatDrPhone', () => {
  it('separa el numero para leerlo', () => {
    expect(formatDrPhone('8095550134')).toBe('809-555-0134');
    expect(formatDrPhone('+1 809 555 0134')).toBe('809-555-0134');
  });

  it('devuelve tal cual lo que no reconoce, en vez de romperlo', () => {
    expect(formatDrPhone('llamar al taller')).toBe('llamar al taller');
    expect(formatDrPhone('')).toBe('');
  });
});

describe('drPhoneValidator', () => {
  it('deja pasar el campo vacio: el telefono es opcional', () => {
    expect(drPhoneValidator(new FormControl(''))).toBeNull();
    expect(drPhoneValidator(new FormControl('   '))).toBeNull();
    expect(drPhoneValidator(new FormControl(null))).toBeNull();
  });

  it('deja pasar un telefono valido', () => {
    expect(drPhoneValidator(new FormControl('809 555 0134'))).toBeNull();
    expect(drPhoneValidator(new FormControl('+18095550134'))).toBeNull();
  });

  it('marca el error cuando hay algo escrito que no es un telefono', () => {
    expect(drPhoneValidator(new FormControl('12345'))).toEqual({ phone: true });
    expect(drPhoneValidator(new FormControl('mi celular'))).toEqual({ phone: true });
  });
});
