/** Dónde se guarda que el usuario descartó el banner de instalar. */
export const INSTALL_DISMISS_KEY = 'x-autohub.install-dismissed';

/** Cuánto tarda el banner en volver a aparecer después de descartarlo. */
export const INSTALL_DISMISS_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `localStorage` puede no existir o lanzar (ventana privada, datos bloqueados). */
export function safeStorage(win: Window | null): Storage | null {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * La app ya está instalada y abierta como app: `display-mode: standalone` en
 * Chrome/Edge/Android, y `navigator.standalone` en Safari de iOS, que no soporta
 * la media query.
 */
export function isStandalone(win: Window | null): boolean {
  if (!win) return false;

  const matches = typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return matches || iosStandalone;
}

/**
 * Safari en iPhone/iPad. Solo ahí el banner enseña los pasos a mano, porque iOS no
 * dispara `beforeinstallprompt`. Un iPad con iPadOS 13+ se presenta como Mac, y lo
 * único que lo delata es la pantalla táctil.
 */
export function isIosSafari(win: Window | null): boolean {
  if (!win) return false;

  const { userAgent, maxTouchPoints } = win.navigator;
  const isIos = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  // Chrome, Firefox, Edge y Opera en iOS son Safari por dentro pero se anuncian aparte.
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(userAgent);

  return isIos && !isOtherBrowser;
}

/** ¿Lo descartó hace menos de 30 días? Una fecha ilegible cuenta como "no descartado". */
export function isInstallDismissed(storage: Storage | null, now: number): boolean {
  try {
    const raw = storage?.getItem(INSTALL_DISMISS_KEY);
    if (!raw) return false;

    const at = Number(raw);
    return Number.isFinite(at) && now - at < INSTALL_DISMISS_DAYS * DAY_MS;
  } catch {
    return false;
  }
}

export function dismissInstall(storage: Storage | null, now: number): void {
  try {
    storage?.setItem(INSTALL_DISMISS_KEY, String(now));
  } catch {
    // Sin almacenamiento el banner vuelve en la próxima visita; no es un error.
  }
}
