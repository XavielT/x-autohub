import { SAFETY_NOTE, isSafetyRelated } from './quote-safety';

describe('quote-safety', () => {
  it('frenos, dirección y fuga de combustible son de seguridad', () => {
    for (const t of ['Los frenos hacen ruido', 'el pedal está blando', 'La dirección vibra', 'Tiene una fuga de gasolina', 'gotea combustible', 'el volante tiembla']) {
      expect(isSafetyRelated(t), t).toBe(true);
    }
  });

  it('un cambio de aceite o un aire sin enfriar no lo son', () => {
    for (const t of ['Quiero cambiar el aceite', 'El aire no enfría', 'Alineación y balanceo', 'Se prende la luz del motor']) {
      expect(isSafetyRelated(t), t).toBe(false);
    }
  });

  it('la nota es fija y sobria', () => {
    expect(SAFETY_NOTE).toBe('Si sientes que no es seguro, no manejes el vehículo y avísanos.');
  });
});
