import { PostgrestError } from '@supabase/supabase-js';

import { translateDbError, unwrap } from './supabase-error';

const err = (code: string, message = 'x'): PostgrestError =>
  ({ code, message, details: '', hint: '', name: 'PostgrestError' }) as PostgrestError;

describe('translateDbError', () => {
  it('los mensajes que la base escribe para quien los lee (22023) llegan tal cual', () => {
    // Antes todo esto se volvía "Algo salió mal", y justo lo que el cliente
    // necesitaba para arreglar su carrito se perdía.
    expect(translateDbError(err('22023', 'De "Disco" solo quedan 1 y pediste 2. Ajusta la cantidad.'))).toBe(
      'De "Disco" solo quedan 1 y pediste 2. Ajusta la cantidad.',
    );
  });

  it('un 22023 sin mensaje no deja el aviso vacío', () => {
    expect(translateDbError(err('22023', ''))).toBe('Los datos no cumplen con lo requerido.');
  });

  it('los permisos siguen sin filtrar detalles técnicos', () => {
    expect(translateDbError(err('42501', 'new row violates row-level security policy'))).toContain('No tienes permiso');
  });

  it('el resto de códigos se traducen y lo desconocido es genérico', () => {
    expect(translateDbError(err('23505'))).toBe('Ese registro ya existe.');
    expect(translateDbError(err('XX000', 'algo interno'))).toBe('Algo salió mal. Intenta de nuevo.');
    expect(translateDbError(null)).toBe('Algo salió mal. Intenta de nuevo.');
  });

  it('sin conexión (fetch sin código) lo dice', () => {
    expect(translateDbError({ ...err('', 'TypeError: Failed to fetch'), code: '' } as PostgrestError)).toBe(
      'Sin conexión con el servidor. Revisa tu internet.',
    );
  });
});

describe('unwrap', () => {
  it('lanza con el mensaje ya traducido', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => unwrap({ data: null, error: err('22023', 'Se agoto "Disco". Quítala del carrito para continuar.') })).toThrow(
      'Se agoto "Disco". Quítala del carrito para continuar.',
    );
  });
});
