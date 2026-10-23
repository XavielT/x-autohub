import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { SettingValue } from '../../core/supabase/database.types';
import { unwrap } from '../../core/supabase/supabase-error';
import { BankAccount, PickupAddress } from '../models/order.model';

/** Qué números muestra la sección de contadores del home. */
export type StatsMode = 'showcase' | 'real';

const STATS_MODE_KEY = 'stats_mode';
const BANK_ACCOUNTS_KEY = 'bank_accounts';
const PICKUP_ADDRESS_KEY = 'pickup_address';

/** Donde se guarda el ajuste en modo simulado. Ver `readMockSettings()`. */
const MOCK_STORAGE_KEY = 'x-autohub.site-settings';

/**
 * Ajustes del sitio (tabla `site_settings`, migración 0014).
 *
 * Hay tres: `stats_mode` (qué números muestra el home) y, desde la migración 0018,
 * `bank_accounts` y `pickup_address` (a dónde transfiere y dónde retira el cliente). El servicio se escribe genérico por dentro
 * (`getSetting`/`setSetting`) y expone un método por ajuste por fuera, que es lo
 * que deja que el siguiente ajuste sean cuatro líneas y no otro servicio. No hay
 * API pública genérica porque no hay nada que la use: una pantalla de "ajustes
 * del sitio" que dibuje claves arbitrarias no existe y no se va a inventar aquí.
 *
 * La escritura va por RPC a la fuerza: la tabla **no tiene política de
 * escritura**, así que un `update` desde el navegador no puede tocarla ni
 * equivocándose. Ver la cabecera de la migración.
 */
@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  private readonly supabase = inject(SupabaseService);

  // --- API pública ---------------------------------------------------------

  getStatsMode(): Observable<StatsMode> {
    return this.getSetting(STATS_MODE_KEY).pipe(map(toStatsMode));
  }

  setStatsMode(mode: StatsMode): Observable<void> {
    return this.setSetting(STATS_MODE_KEY, mode);
  }

  /**
   * Las cuentas para transferir. Las de ejemplo que deja la migración llegan
   * marcadas (`isExample`): quien las muestre al público tiene que descartarlas
   * (`realBankAccounts`).
   */
  getBankAccounts(): Observable<BankAccount[]> {
    return this.getSetting(BANK_ACCOUNTS_KEY).pipe(map(toBankAccounts));
  }

  setBankAccounts(accounts: readonly BankAccount[]): Observable<void> {
    return this.setSetting(
      BANK_ACCOUNTS_KEY,
      accounts.map((a) => ({
        bank: a.bank.trim(),
        holder: a.holder.trim(),
        number: a.number.trim(),
        type: a.type.trim(),
      })),
    );
  }

  /** La dirección de retiro, o `null` si nadie la cargó. */
  getPickupAddress(): Observable<PickupAddress | null> {
    return this.getSetting(PICKUP_ADDRESS_KEY).pipe(map(toPickupAddress));
  }

  setPickupAddress(value: { address: string; hours: string }): Observable<void> {
    return this.setSetting(PICKUP_ADDRESS_KEY, {
      address: value.address.trim(),
      hours: value.hours.trim(),
    });
  }

  // --- Genérico por dentro -------------------------------------------------

  private getSetting(key: string): Observable<SettingValue> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.readMockSettings()[key] ?? null);
    }

    return from(
      this.supabase.db.from('site_settings').select('value').eq('key', key).maybeSingle(),
    ).pipe(
      map((res) => {
        // `maybeSingle()` y no `single()`: que falte la fila no es un error del
        // que haya que avisar al visitante — el valor por defecto resuelve.
        if (res.error) {
          console.error('[supabase]', res.error);
          throw new Error('No pudimos leer los ajustes del sitio.');
        }
        return res.data?.value ?? null;
      }),
    );
  }

  private setSetting(key: string, value: SettingValue): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.writeMockSettings({ ...this.readMockSettings(), [key]: value });
      return of(undefined);
    }

    return from(
      this.supabase.db.rpc('set_site_setting', { p_key: key, p_value: value }),
    ).pipe(
      map((res) => {
        unwrap(res);
      }),
    );
  }

  // --- Modo simulado -------------------------------------------------------

  /**
   * En modo simulado el ajuste vive en `localStorage`, no en memoria.
   *
   * Parece exagerado para un dev server, y no lo es: en memoria, cambiar el
   * modo en /admin/ajustes y recargar el home lo devolvería a `showcase`, y
   * quien lo probara concluiría que el interruptor no funciona. Es la misma
   * trampa que la ronda 14 documentó con `mockItems` (cambiar de sesión obliga a
   * recargar y se pierde lo recién creado). En modo real el ajuste **persiste**
   * porque está en Postgres; el modo simulado tiene que comportarse igual.
   */
  private readMockSettings(): Record<string, SettingValue> {
    const defaults: Record<string, SettingValue> = {
      [STATS_MODE_KEY]: 'showcase',
      // Los mismos valores de ejemplo que deja la migración 0018.
      [BANK_ACCOUNTS_KEY]: [
        {
          bank: 'Banco de ejemplo',
          holder: 'Titular de ejemplo',
          number: '000-000000-0',
          type: 'Corriente',
          is_example: true,
        },
      ],
      [PICKUP_ADDRESS_KEY]: {
        address: 'Dirección de ejemplo: reemplázala desde Ajustes',
        hours: 'Horario de ejemplo',
        is_example: true,
      },
    };

    try {
      const raw = localStorage.getItem(MOCK_STORAGE_KEY);
      if (!raw) return defaults;
      return { ...defaults, ...(JSON.parse(raw) as Record<string, SettingValue>) };
    } catch {
      // Modo privado, storage lleno o JSON corrupto: los valores por defecto.
      return defaults;
    }
  }

  private writeMockSettings(settings: Record<string, SettingValue>): void {
    try {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Sin storage el ajuste no sobrevive a la recarga, pero la app sigue.
    }
  }
}

/**
 * Cualquier cosa que no sea exactamente `"real"` es `showcase`.
 *
 * El valor es `jsonb` y Postgres no comprueba su forma más allá del `check` de
 * la clave. Si algún día llega otra cosa, la sección tiene que seguir pintando
 * algo: caer al modo de impresión enseña números de más, no una fila vacía.
 */
function toStatsMode(value: SettingValue): StatsMode {
  return value === 'real' ? 'real' : 'showcase';
}

/** Un objeto JSON con claves de texto, o `null`. */
function asRecord(value: SettingValue): Record<string, SettingValue> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}

const text = (value: SettingValue | undefined): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Las cuentas, tal como las guardó el panel. Lo que no tenga banco **y** número
 * se descarta: es una fila a medias, y una cuenta a medias en pantalla es peor
 * que ninguna.
 */
export function toBankAccounts(value: SettingValue): BankAccount[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) return [];

    const account: BankAccount = {
      bank: text(record['bank']),
      holder: text(record['holder']),
      number: text(record['number']),
      type: text(record['type']),
      isExample: record['is_example'] === true,
    };

    return account.bank && account.number ? [account] : [];
  });
}

/** Las cuentas que de verdad se pueden mostrar al público: sin las de ejemplo. */
export function realBankAccounts(accounts: readonly BankAccount[]): BankAccount[] {
  return accounts.filter((a) => !a.isExample);
}

export function toPickupAddress(value: SettingValue): PickupAddress | null {
  const record = asRecord(value);
  if (!record) return null;

  const address = text(record['address']);
  if (!address) return null;

  return { address, hours: text(record['hours']), isExample: record['is_example'] === true };
}
