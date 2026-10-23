import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  dismissInstall,
  isInstallDismissed,
  isIosSafari,
  isStandalone,
  safeStorage,
} from '../../utils/pwa-env';

/** El evento de Chrome/Edge/Android que aún no está en los tipos de TypeScript. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Banner para instalar la app. Tres caminos:
 *
 * - **Chrome, Edge, Android:** el navegador avisa con `beforeinstallprompt`; se guarda
 *   el evento y el botón "Instalar" lo dispara.
 * - **Safari en iPhone/iPad:** no hay evento ni API; se enseñan los pasos a mano.
 * - **Ya instalada (`standalone`):** no se muestra nunca.
 *
 * "Ahora no" lo oculta 30 días (`localStorage`). Solo se ve en el teléfono; en
 * escritorio el navegador ya trae su propio ícono de instalar.
 */
@Component({
  selector: 'app-install-prompt',
  templateUrl: './install-prompt.html',
  styleUrl: './install-prompt.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallPrompt {
  private readonly win = inject(DOCUMENT).defaultView;
  private readonly storage = safeStorage(this.win);

  private readonly deferred = signal<BeforeInstallPromptEvent | null>(null);
  private readonly dismissed = signal(isInstallDismissed(this.storage, Date.now()));
  private readonly installed = signal(isStandalone(this.win));
  private readonly ios = isIosSafari(this.win);

  /** `null` = no mostrar nada. */
  readonly mode = computed<'native' | 'ios' | null>(() => {
    if (this.installed() || this.dismissed()) return null;
    if (this.deferred()) return 'native';
    return this.ios ? 'ios' : null;
  });

  constructor() {
    const win = this.win;
    if (!win) return;

    const onPrompt = (event: Event) => {
      // Sin esto Chrome muestra su propia barra y el evento no se puede reusar.
      event.preventDefault();
      this.deferred.set(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      this.deferred.set(null);
      this.installed.set(true);
    };

    win.addEventListener('beforeinstallprompt', onPrompt);
    win.addEventListener('appinstalled', onInstalled);
    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('beforeinstallprompt', onPrompt);
      win.removeEventListener('appinstalled', onInstalled);
    });
  }

  async install(): Promise<void> {
    const event = this.deferred();
    if (!event) return;

    // El evento solo sirve una vez, gane quien gane.
    this.deferred.set(null);
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'dismissed') this.dismiss();
  }

  dismiss(): void {
    dismissInstall(this.storage, Date.now());
    this.dismissed.set(true);
  }
}
