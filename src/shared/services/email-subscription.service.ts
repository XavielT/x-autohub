import { Injectable, inject } from '@angular/core';
import { Observable, catchError, delay, from, map, of, switchMap, timeout } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { translateDbError } from '../../core/supabase/supabase-error';

export interface SubscriptionResult {
  ok: boolean;
  /** true cuando ese correo ya estaba en la lista. */
  alreadySubscribed: boolean;
  /**
   * true **solo** cuando la función `club-welcome` confirma que envió el correo.
   *
   * Es lo que decide si el sitio puede decir "revisa tu correo". El cliente no
   * tiene manera de saber si hay una `RESEND_API_KEY` configurada en el
   * proyecto, así que no lo adivina: se lo pregunta a la función.
   */
  welcomeEmailSent: boolean;
}

/**
 * Cuánto se espera a la función antes de dar la suscripción por buena de todos
 * modos. Guardar la fila ya salió bien a estas alturas; el correo es un extra y
 * no puede dejar el formulario colgado en "Registrando...".
 */
const WELCOME_TIMEOUT_MS = 5000;

/** Suscripciones al Club X AutoHub (formulario del home). */
@Injectable({ providedIn: 'root' })
export class EmailSubscriptionService {
  private readonly supabase = inject(SupabaseService);

  subscribe(email: string): Observable<SubscriptionResult> {
    const address = email.trim().toLowerCase();

    if (this.supabase.shouldUseMockData()) {
      // El delay hace visible el estado de carga del formulario. Sin backend no
      // hay función que invocar, así que aquí nunca se promete un correo.
      return of(this.result({ alreadySubscribed: false, welcomeEmailSent: false })).pipe(delay(600));
    }

    return from(this.supabase.db.from('club_subscriptions').insert({ email: address })).pipe(
      map((res) => {
        // 23505 = ya está suscrito. Para el usuario eso es un éxito, no un error.
        if (res.error && res.error.code !== '23505') {
          console.error('[supabase]', res.error);
          throw new Error(translateDbError(res.error));
        }
        return res.error?.code === '23505';
      }),
      switchMap((alreadySubscribed) => {
        // El correo de bienvenida solo se manda cuando la suscripción es nueva.
        // Si se mandara también en el duplicado, cualquiera podría reenviárselo
        // a un tercero pulsando el botón con su dirección.
        if (alreadySubscribed) {
          return of(this.result({ alreadySubscribed: true, welcomeEmailSent: false }));
        }

        return this.sendWelcomeEmail(address).pipe(
          map((welcomeEmailSent) => this.result({ alreadySubscribed: false, welcomeEmailSent })),
        );
      }),
    );
  }

  /**
   * Invoca la función `club-welcome`. **Nunca** falla hacia afuera.
   *
   * La suscripción ya está guardada cuando esto corre: que el correo no salga
   * —porque la función no está desplegada, porque falta la clave de Resend, o
   * porque Resend devolvió un error— no puede convertirse en un mensaje de
   * fallo para alguien que sí quedó suscrito. Cualquier problema se registra en
   * consola y se responde `false`, que es lo que hace al mensaje honesto.
   */
  private sendWelcomeEmail(email: string): Observable<boolean> {
    return from(
      this.supabase.db.functions.invoke<{ sent?: boolean }>('club-welcome', {
        body: { email },
      }),
    ).pipe(
      timeout(WELCOME_TIMEOUT_MS),
      map(({ data, error }) => {
        if (error) {
          console.warn('[club-welcome] no se envió el correo de bienvenida', error);
          return false;
        }
        return data?.sent === true;
      }),
      catchError((error: unknown) => {
        console.warn('[club-welcome] no se envió el correo de bienvenida', error);
        return of(false);
      }),
    );
  }

  private result(partial: Omit<SubscriptionResult, 'ok'>): SubscriptionResult {
    return { ok: true, ...partial };
  }
}
