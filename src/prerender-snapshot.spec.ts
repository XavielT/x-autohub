import { SNAPSHOT_ID, SNAPSHOT_MAX_MS, holdPrerenderedPage } from './prerender-snapshot';

describe('holdPrerenderedPage', () => {
  let root: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('app-root');
    document.body.appendChild(root);
  });

  afterEach(() => {
    vi.useRealTimers();
    root.remove();
    document.getElementById(SNAPSHOT_ID)?.remove();
  });

  it('una ruta sin prerenderizar (app-root vacío) no hace nada', () => {
    const release = holdPrerenderedPage(document);

    expect(document.getElementById(SNAPSHOT_ID)).toBeNull();
    expect(() => release()).not.toThrow();
  });

  it('sin app-root tampoco hace nada', () => {
    root.remove();

    expect(() => holdPrerenderedPage(document)()).not.toThrow();
    expect(document.getElementById(SNAPSHOT_ID)).toBeNull();
  });

  it('pasa el contenido a una capa encima y deja app-root vacío para que Angular arranque', () => {
    root.innerHTML = '<h1>Producto</h1><p>Texto</p>';

    holdPrerenderedPage(document);

    const snapshot = document.getElementById(SNAPSHOT_ID)!;
    expect(snapshot.innerHTML).toBe('<h1>Producto</h1><p>Texto</p>');
    expect(root.childNodes.length).toBe(0);
    expect(root.nextElementSibling).toBe(snapshot);
  });

  it('la capa no se toca, no se lee y está por encima de todo', () => {
    root.innerHTML = '<h1>Producto</h1>';

    holdPrerenderedPage(document);

    const snapshot = document.getElementById(SNAPSHOT_ID)!;
    expect(snapshot.getAttribute('aria-hidden')).toBe('true');
    expect(snapshot.hasAttribute('inert')).toBe(true);
    expect(snapshot.style.pointerEvents).toBe('none');
    expect(snapshot.style.position).toBe('absolute');
  });

  it('release() la quita, y llamarlo otra vez no falla', () => {
    root.innerHTML = '<h1>Producto</h1>';
    const release = holdPrerenderedPage(document);

    release();
    release();

    expect(document.getElementById(SNAPSHOT_ID)).toBeNull();
  });

  it('si la app nunca queda estable, la capa se quita sola: no puede dejar la página congelada', () => {
    root.innerHTML = '<h1>Producto</h1>';
    holdPrerenderedPage(document);

    vi.advanceTimersByTime(SNAPSHOT_MAX_MS - 1);
    expect(document.getElementById(SNAPSHOT_ID)).not.toBeNull();

    vi.advanceTimersByTime(2);
    expect(document.getElementById(SNAPSHOT_ID)).toBeNull();
  });

  it('quitarla a mano cancela el plazo (no queda un temporizador colgando)', () => {
    root.innerHTML = '<h1>Producto</h1>';
    const release = holdPrerenderedPage(document);

    release();

    expect(vi.getTimerCount()).toBe(0);
  });
});
