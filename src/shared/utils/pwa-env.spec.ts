import {
  INSTALL_DISMISS_DAYS,
  INSTALL_DISMISS_KEY,
  dismissInstall,
  isInstallDismissed,
  isIosSafari,
  isStandalone,
  safeStorage,
} from './pwa-env';

const DAY = 24 * 60 * 60 * 1000;

function fakeWindow(opts: { ua?: string; touch?: number; standalone?: boolean; mq?: boolean | 'none' }): Window {
  return {
    navigator: { userAgent: opts.ua ?? '', maxTouchPoints: opts.touch ?? 0, standalone: opts.standalone },
    matchMedia: opts.mq === 'none' ? undefined : () => ({ matches: opts.mq === true }),
  } as unknown as Window;
}

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
  } as unknown as Storage;
}

describe('pwa-env', () => {
  describe('isStandalone', () => {
    it('es true con display-mode: standalone (Chrome, Edge, Android)', () => {
      expect(isStandalone(fakeWindow({ mq: true }))).toBe(true);
    });

    it('es true con navigator.standalone (Safari en iOS, que no tiene la media query)', () => {
      expect(isStandalone(fakeWindow({ mq: 'none', standalone: true }))).toBe(true);
    });

    it('es false en una pestaña normal, y sin window', () => {
      expect(isStandalone(fakeWindow({ mq: false }))).toBe(false);
      expect(isStandalone(null)).toBe(false);
    });
  });

  describe('isIosSafari', () => {
    const SAFARI_IPHONE =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
    const CHROME_IPHONE =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1';
    const CHROME_ANDROID =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
    const MAC_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15';

    it('detecta Safari en iPhone', () => {
      expect(isIosSafari(fakeWindow({ ua: SAFARI_IPHONE }))).toBe(true);
    });

    it('detecta un iPad con iPadOS 13+, que se presenta como Mac pero es táctil', () => {
      expect(isIosSafari(fakeWindow({ ua: MAC_DESKTOP, touch: 5 }))).toBe(true);
    });

    it('un Mac de verdad (sin pantalla táctil) no cuenta', () => {
      expect(isIosSafari(fakeWindow({ ua: MAC_DESKTOP, touch: 0 }))).toBe(false);
    });

    it('Chrome en iPhone y Chrome en Android no cuentan', () => {
      expect(isIosSafari(fakeWindow({ ua: CHROME_IPHONE }))).toBe(false);
      expect(isIosSafari(fakeWindow({ ua: CHROME_ANDROID }))).toBe(false);
    });
  });

  describe('descartar el banner', () => {
    const NOW = Date.UTC(2026, 9, 23);

    it('sin nada guardado no está descartado', () => {
      expect(isInstallDismissed(fakeStorage(), NOW)).toBe(false);
    });

    it('descartado hace 29 días sigue oculto; a los 30 vuelve', () => {
      const store = fakeStorage();
      dismissInstall(store, NOW - (INSTALL_DISMISS_DAYS - 1) * DAY);
      expect(isInstallDismissed(store, NOW)).toBe(true);

      const old = fakeStorage({ [INSTALL_DISMISS_KEY]: String(NOW - INSTALL_DISMISS_DAYS * DAY) });
      expect(isInstallDismissed(old, NOW)).toBe(false);
    });

    it('una fecha ilegible cuenta como no descartado', () => {
      expect(isInstallDismissed(fakeStorage({ [INSTALL_DISMISS_KEY]: 'ayer' }), NOW)).toBe(false);
    });

    it('sin almacenamiento (o uno que lanza) no rompe nada', () => {
      const broken = {
        getItem: () => {
          throw new Error('bloqueado');
        },
        setItem: () => {
          throw new Error('bloqueado');
        },
      } as unknown as Storage;

      expect(isInstallDismissed(null, NOW)).toBe(false);
      expect(isInstallDismissed(broken, NOW)).toBe(false);
      expect(() => dismissInstall(broken, NOW)).not.toThrow();
      expect(() => dismissInstall(null, NOW)).not.toThrow();
    });

    it('safeStorage devuelve null si leer localStorage lanza', () => {
      const win = {
        get localStorage(): Storage {
          throw new Error('bloqueado');
        },
      } as unknown as Window;

      expect(safeStorage(win)).toBeNull();
      expect(safeStorage(null)).toBeNull();
    });
  });
});
