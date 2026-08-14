import {
  RequiredField,
  focusFirstInvalid,
  missingFieldLabels,
  missingFieldsMessage,
} from './required-fields';

/** Los tres campos que hoy fallan más en `publicar`, en el orden del formulario. */
const campos = (invalidos: string[]): RequiredField[] =>
  [
    { key: 'category', label: 'Categoria' },
    { key: 'title', label: 'Titulo' },
    { key: 'price', label: 'Precio' },
    { key: 'location', label: 'Ubicacion' },
  ].map((f) => ({ ...f, invalid: invalidos.includes(f.key) }));

describe('missingFieldsMessage', () => {
  it('nombra los campos que faltan en el orden del formulario', () => {
    // Se pasan desordenados a proposito: el orden lo manda la lista, no el argumento.
    expect(missingFieldsMessage(campos(['price', 'title']))).toBe(
      'Te falta completar: Titulo, Precio.',
    );
  });

  it('nombra uno solo sin coma', () => {
    expect(missingFieldsMessage(campos(['location']))).toBe('Te falta completar: Ubicacion.');
  });

  it('devuelve cadena vacia cuando no falta nada', () => {
    expect(missingFieldsMessage(campos([]))).toBe('');
  });

  it('missingFieldLabels devuelve solo las etiquetas invalidas', () => {
    expect(missingFieldLabels(campos(['category', 'location']))).toEqual([
      'Categoria',
      'Ubicacion',
    ]);
  });
});

describe('focusFirstInvalid', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    // Cada control se localiza por un atributo distinto, que es justo lo que el
    // helper tiene que cubrir: reactivo (formcontrolname), ngModel (name),
    // un elemento que no es control (data-field) y el id como ultimo recurso.
    host.innerHTML = `
      <select formcontrolname="category"></select>
      <input name="title" />
      <div data-field="images" tabindex="-1"></div>
      <input id="location" />
    `;
    document.body.appendChild(host);
  });

  afterEach(() => host.remove());

  it('enfoca el primero que falta segun el orden de la lista, no del DOM', () => {
    // `location` esta antes en el DOM que... no: esta despues. Lo que importa es
    // que con dos invalidos gana el que va primero en la lista.
    const encontrado = focusFirstInvalid(host, campos(['location', 'title']));

    expect(encontrado).toBe(true);
    expect(document.activeElement).toBe(host.querySelector('[name="title"]'));
  });

  it('encuentra un control reactivo por formcontrolname', () => {
    focusFirstInvalid(host, campos(['category']));

    expect(document.activeElement).toBe(host.querySelector('[formcontrolname="category"]'));
  });

  it('encuentra por id cuando no hay formcontrolname ni name', () => {
    focusFirstInvalid(host, campos(['location']));

    expect(document.activeElement).toBe(host.querySelector('#location'));
  });

  it('enfoca un elemento que no es un control, como la caja de imagenes', () => {
    const encontrado = focusFirstInvalid(host, [
      { key: 'images', label: 'Imagenes', invalid: true },
    ]);

    expect(encontrado).toBe(true);
    expect(document.activeElement).toBe(host.querySelector('[data-field="images"]'));
  });

  it('no hace nada y devuelve false cuando no falta nada', () => {
    expect(focusFirstInvalid(host, campos([]))).toBe(false);
  });

  it('devuelve false si la clave no existe en la plantilla', () => {
    // Sirve de alarma: la lista y la plantilla se desincronizaron.
    expect(focusFirstInvalid(host, [{ key: 'noExiste', label: 'X', invalid: true }])).toBe(false);
  });
});
