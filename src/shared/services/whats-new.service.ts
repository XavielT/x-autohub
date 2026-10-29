import { Injectable, InjectionToken, PLATFORM_ID, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { APP_VERSION } from '../../app/app-version';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { ReleaseModel } from '../models/release.model';
import { compareVersions, maxVersion, pendingReleases } from '../utils/release-notes';
import { AuthService } from './auth.service';
import { ReleaseService } from './release.service';

/** La versión que corre ahora. Un token para poder cambiarla en las pruebas. */
export const CURRENT_VERSION = new InjectionToken<string>('current-version', {
  providedIn: 'root',
  factory: () => APP_VERSION,
});

/** Dónde recuerda el navegador la última versión vista (el invitado, y una cuenta mientras no hay red). */
export const LAST_SEEN_KEY = 'xah.lastSeenVersion';

export interface WhatsNew {
  releases: ReleaseModel[];
  /** Hay más versiones sin ver que las que caben: se manda a /novedades. */
  hasMore: boolean;
}

function readLocal(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

function writeLocal(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, version);
  } catch {
    // Sin almacenamiento: la modal puede volver a salir; no se rompe nada.
  }
}

/**
 * "Novedades de la actualización": decide cuándo enseñar la modal y qué decirle a quien
 * vuelve al sitio después de una versión nueva.
 *
 *   · La última versión vista vive en `localStorage` (invitado) y en
 *     `profiles.last_seen_version` (con cuenta); al iniciar sesión vale la mayor de las dos.
 *   · **Primera visita**: no se muestra nada y se guarda la versión actual.
 *   · Si la actual es mayor que la vista, se leen las versiones **publicadas** entre las dos
 *     (máximo 3, las más recientes). Si ninguna cae ahí, se guarda en silencio.
 *   · "Entendido" (o cerrar) marca la versión actual como vista, y no vuelve a salir aunque se
 *     recargue. Cuando el aviso "Hay una versión nueva" recarga la página, la modal sale
 *     después de recargar —porque la versión subió—: es un solo aviso, no dos.
 */
@Injectable({ providedIn: 'root' })
export class WhatsNewService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly releases = inject(ReleaseService);
  private readonly current = inject(CURRENT_VERSION);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _pending = signal<WhatsNew | null>(null);
  /** Lo que enseña la modal; `null` = nada que mostrar. */
  readonly pending = this._pending.asReadonly();

  /** En modo simulado no hay tabla `profiles`: lo "guardado en la cuenta" vive aquí. */
  private readonly mockSeen = new Map<string, string>();
  private checking = false;

  constructor() {
    if (!this.isBrowser) return;
    // Con cada cambio de sesión se vuelve a decidir (al iniciar sesión puede haber una versión vista en la cuenta).
    effect(() => {
      const userId = this.auth.user()?.id ?? null;
      untracked(() => void this.check(userId));
    });
  }

  async check(userId?: string | null): Promise<void> {
    if (this.checking || this._pending() !== null) return;
    this.checking = true;
    try {
      await this.auth.whenReady();
      const id = userId === undefined ? (this.auth.user()?.id ?? null) : userId;
      const seen = maxVersion(readLocal(), id ? await this.readAccount(id) : null);

      if (seen === null) {
        await this.markSeen(id); // primera visita
        return;
      }
      if (compareVersions(this.current, seen) <= 0) return;

      const all = await firstValueFrom(this.releases.getAll(false));
      const { shown, hasMore } = pendingReleases(all, seen, this.current);
      if (shown.length === 0) {
        await this.markSeen(id);
        return;
      }
      this._pending.set({ releases: shown, hasMore });
    } catch {
      // Las novedades son un extra: si algo falla, el sitio sigue como si nada.
    } finally {
      this.checking = false;
    }
  }

  /** "Entendido": la versión actual queda como vista, aquí y en la cuenta. */
  async dismiss(): Promise<void> {
    this._pending.set(null);
    await this.markSeen(this.auth.user()?.id ?? null);
  }

  private async markSeen(userId: string | null): Promise<void> {
    writeLocal(this.current);
    if (!userId) return;

    if (this.supabase.shouldUseMockData()) {
      this.mockSeen.set(userId, this.current);
      return;
    }
    try {
      // `update` sin devolver la fila: `select('*')` sobre `profiles` falla (0006).
      await this.supabase.db.from('profiles').update({ last_seen_version: this.current }).eq('id', userId);
    } catch {
      // Sin red: queda en el navegador y se vuelve a intentar la próxima vez.
    }
  }

  private async readAccount(userId: string): Promise<string | null> {
    if (this.supabase.shouldUseMockData()) return this.mockSeen.get(userId) ?? null;
    try {
      const res = await this.supabase.db.from('profiles').select('last_seen_version').eq('id', userId).maybeSingle();
      return res.data?.last_seen_version ?? null;
    } catch {
      return null;
    }
  }
}
