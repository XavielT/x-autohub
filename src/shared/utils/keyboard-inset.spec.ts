import { trackKeyboard } from './keyboard-inset';

describe('trackKeyboard', () => {
  const realViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  const realMatchMedia = window.matchMedia;

  afterEach(() => {
    if (realViewport) Object.defineProperty(window, 'visualViewport', realViewport);
    else delete (window as unknown as Record<string, unknown>)['visualViewport'];
    window.matchMedia = realMatchMedia;
  });

  function simular(movil: boolean, alto: number) {
    const vv = new EventTarget() as EventTarget & { height: number; offsetTop: number };
    vv.height = alto;
    vv.offsetTop = 0;
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    window.matchMedia = ((q: string) => ({ matches: movil, media: q }) as MediaQueryList) as typeof window.matchMedia;
    return vv;
  }

  it('mide lo que tapa el teclado y avisa cuando cambia', () => {
    const vv = simular(true, window.innerHeight - 300);
    const visto: number[] = [];
    const stop = trackKeyboard(900, (m) => visto.push(m.inset));

    vv.height = window.innerHeight;
    vv.dispatchEvent(new Event('resize'));

    expect(visto).toEqual([300, 0]);
    stop?.();
  });

  it('al parar deja de avisar', () => {
    const vv = simular(true, window.innerHeight - 300);
    const visto: number[] = [];
    const stop = trackKeyboard(900, (m) => visto.push(m.inset));
    stop?.();

    vv.dispatchEvent(new Event('resize'));

    expect(visto).toEqual([300]);
  });

  it('en una ventana ancha no hace nada', () => {
    simular(false, window.innerHeight - 300);
    const aviso = vi.fn();

    expect(trackKeyboard(900, aviso)).toBeNull();
    expect(aviso).not.toHaveBeenCalled();
  });
});
