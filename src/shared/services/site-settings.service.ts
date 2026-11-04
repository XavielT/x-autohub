import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { SettingValue } from '../../core/supabase/database.types';
import { unwrap } from '../../core/supabase/supabase-error';
import { BankAccount, PickupAddress } from '../models/order.model';

const BANK_ACCOUNTS_KEY = 'bank_accounts';
const PICKUP_ADDRESS_KEY = 'pickup_address';

/** Donde se guarda el ajuste en modo simulado. Ver `readMockSettings()`. */
const MOCK_STORAGE_KEY = 'x-autohub.site-settings';

/**
 * Ajustes del sitio (tabla `site_settings`, migración 0014).
 *
 * Hay dos: `bank_accounts` y `pickup_address` (a dónde transfiere y dónde retira el
 * cliente, migración 0018). La tabla todavía guarda una fila `stats_mode` de cuando el
 * home tenía un contador; ya nada la lee (ver `docs/ROADMAP.md`). El servicio se
 * escribe genérico por dentro (`getSetting`/`setSetting`) y expone un método por
 * ajuste por fuera, que es lo que deja que el siguiente ajuste sean cuatro líneas y
 * no otro servicio. No hay
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

  /** Las coordenadas y el `placeId` son opcionales: sin ellas se guarda solo el texto (el check de la 0059 exige que, si hay, sean números válidos). */
  setPickupAddress(value: { address: string; hours: string; lat?: number; lng?: number; placeId?: string }): Observable<void> {
    const hasPoint = typeof value.lat === 'number' && typeof value.lng === 'number';
    return this.setSetting(PICKUP_ADDRESS_KEY, {
      address: value.address.trim(),
      hours: value.hours.trim(),
      ...(hasPoint ? { lat: value.lat, lng: value.lng } : {}),
      ...(hasPoint && value.placeId ? { place_id: value.placeId } : {}),
    });
  }

  /**
   * Los interruptores y topes de la IA (migración 0050): `ai_*` y `maps_monthly_cap_usd`. Se leen en público; se escriben
   * con `set_site_setting()` (solo admin).
   */
  getAiSettings(): Observable<Record<string, SettingValue>> {
    if (this.supabase.shouldUseMockData()) {
      const all = this.readMockSettings();
      return of(Object.fromEntries(Object.entries(all).filter(([key]) => isAiKey(key))));
    }

    return from(
      this.supabase.db.from('site_settings').select('key, value').or('key.like.ai_*,key.eq.maps_monthly_cap_usd'),
    ).pipe(map((res) => Object.fromEntries(unwrap(res).map((row) => [row.key, row.value]))));
  }

  setAiSetting(key: string, value: boolean | number): Observable<void> {
    return this.setSetting(key, value);
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
   * Parece exagerado para un dev server, y no lo es: en memoria, guardar las
   * cuentas en /admin/ajustes y recargar las devolvería a las de ejemplo, y
   * quien lo probara concluiría que guardar no funciona. Es la misma
   * trampa que la ronda 14 documentó con `mockItems` (cambiar de sesión obliga a
   * recargar y se pierde lo recién creado). En modo real el ajuste **persiste**
   * porque está en Postgres; el modo simulado tiene que comportarse igual.
   */
  private readMockSettings(): Record<string, SettingValue> {
    const defaults: Record<string, SettingValue> = {
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

const isAiKey = (key: string): boolean => key.startsWith('ai_') || key === 'maps_monthly_cap_usd';

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

  const lat = record['lat'];
  const lng = record['lng'];
  const placeId = text(record['place_id']);
  const hasPoint = typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);

  return {
    address,
    hours: text(record['hours']),
    isExample: record['is_example'] === true,
    ...(hasPoint ? { lat, lng } : {}),
    ...(hasPoint && placeId ? { placeId } : {}),
  };
}
