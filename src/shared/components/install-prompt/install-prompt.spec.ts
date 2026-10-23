import { TestBed } from '@angular/core/testing';
import { InstallPrompt } from './install-prompt';
import { INSTALL_DISMISS_KEY } from '../../utils/pwa-env';

const DAY = 24 * 60 * 60 * 1000;
const UA_SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

describe('InstallPrompt', () => {
  const realUa = window.navigator.userAgent;

  function setUa(ua: string) {
    Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
  }

  function setStandalone(on: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      value: (q: string) => ({ matches: on && q.includes('standalone') }),
      configurable: true,
    });
  }

  /** Lo que hace Chrome: un evento con `prompt()` y `userChoice`. */
  function chromeOffersInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome });
    window.dispatchEvent(event);
    return event;
  }

  async function montar() {
    const fixture = TestBed.createComponent(InstallPrompt);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const render = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, c: fixture.componentInstance, el, render };
  }

  beforeEach(() => {
    localStorage.clear();
    setStandalone(false);
    setUa(UA_CHROME_ANDROID);
  });

  afterEach(() => {
    localStorage.clear();
    setUa(realUa);
  });

  it('no muestra nada hasta que el navegador ofrece instalar', async () => {
    const { el } = await montar();

    expect(el.querySelector('.ip')).toBeNull();
  });

  describe('Android / Chrome', () => {
    it('al llegar beforeinstallprompt muestra el banner con el botón Instalar', async () => {
      const { el, render } = await montar();

      const event = chromeOffersInstall();
      await render();

      expect(event.defaultPrevented).toBe(true); // Chrome no pinta su propia barra
      expect(el.textContent).toContain('Instala X AutoHub en tu teléfono');
      expect(el.querySelector('.ip__btn')?.textContent).toContain('Instalar');
    });

    it('Instalar lanza el diálogo del navegador y esconde el banner', async () => {
      const { el, render } = await montar();
      const event = chromeOffersInstall('accepted');
      await render();

      (el.querySelector('.ip__btn') as HTMLButtonElement).click();
      await render();

      expect(event.prompt).toHaveBeenCalledTimes(1);
      expect(el.querySelector('.ip')).toBeNull();
      // Aceptó: no hace falta recordar nada.
      expect(localStorage.getItem(INSTALL_DISMISS_KEY)).toBeNull();
    });

    it('si cierra el diálogo del navegador cuenta como descartado', async () => {
      const { el, render } = await montar();
      chromeOffersInstall('dismissed');
      await render();

      (el.querySelector('.ip__btn') as HTMLButtonElement).click();
      await render();

      expect(localStorage.getItem(INSTALL_DISMISS_KEY)).not.toBeNull();
    });

    it('al instalarse (appinstalled) el banner desaparece', async () => {
      const { el, render } = await montar();
      chromeOffersInstall();
      await render();

      window.dispatchEvent(new Event('appinstalled'));
      await render();

      expect(el.querySelector('.ip')).toBeNull();
    });
  });

  describe('iPhone / Safari', () => {
    it('enseña los pasos a mano, sin botón Instalar', async () => {
      setUa(UA_SAFARI_IPHONE);
      const { el } = await montar();

      expect(el.textContent).toContain('Compartir');
      expect(el.textContent).toContain('Agregar a pantalla de inicio');
      expect(el.querySelector('.ip__btn')).toBeNull();
    });
  });

  describe('ya instalada (standalone)', () => {
    it('no aparece aunque el navegador ofrezca instalar', async () => {
      setStandalone(true);
      const { el, render } = await montar();

      chromeOffersInstall();
      await render();

      expect(el.querySelector('.ip')).toBeNull();
    });

    it('ni en iPhone', async () => {
      setStandalone(true);
      setUa(UA_SAFARI_IPHONE);
      const { el } = await montar();

      expect(el.querySelector('.ip')).toBeNull();
    });
  });

  describe('descartar', () => {
    it('"Ahora no" oculta el banner y lo recuerda 30 días', async () => {
      const { el, render } = await montar();
      chromeOffersInstall();
      await render();

      (el.querySelector('.ip__close') as HTMLButtonElement).click();
      await render();

      expect(el.querySelector('.ip')).toBeNull();
      expect(Number(localStorage.getItem(INSTALL_DISMISS_KEY))).toBeGreaterThan(Date.now() - 5000);
    });

    it('descartado hace 10 días: no vuelve, ni con el evento del navegador', async () => {
      localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() - 10 * DAY));
      const { el, render } = await montar();

      chromeOffersInstall();
      await render();

      expect(el.querySelector('.ip')).toBeNull();
    });

    it('descartado hace 31 días: vuelve', async () => {
      localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() - 31 * DAY));
      const { el, render } = await montar();

      chromeOffersInstall();
      await render();

      expect(el.querySelector('.ip')).not.toBeNull();
    });
  });
});
