import { selectNumberOnFocus } from './select-on-focus';

describe('selectNumberOnFocus', () => {
  const field = (type: string, extra: Partial<HTMLInputElement> = {}) => {
    const input = document.createElement('input');
    input.type = type;
    input.value = '0';
    Object.assign(input, extra);
    input.select = vi.fn();
    return input;
  };

  it('selecciona el contenido de un campo numérico', () => {
    const input = field('number');
    selectNumberOnFocus({ target: input } as unknown as Event);
    expect(input.select).toHaveBeenCalled();
  });

  it('no toca texto, campos bloqueados ni nada que no sea un input', () => {
    const text = field('text');
    const locked = field('number', { disabled: true });
    selectNumberOnFocus({ target: text } as unknown as Event);
    selectNumberOnFocus({ target: locked } as unknown as Event);
    selectNumberOnFocus({ target: document.body } as unknown as Event);
    expect(text.select).not.toHaveBeenCalled();
    expect(locked.select).not.toHaveBeenCalled();
  });
});
