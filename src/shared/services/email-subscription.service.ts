import { Injectable, inject } from '@angular/core';
import { Observable, delay, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { translateDbError } from '../../core/supabase/supabase-error';

export interface SubscriptionResult {
  ok: boolean;
}

/** Suscripciones al Club X AutoHub (formulario del home). */
@Injectable({ providedIn: 'root' })
export class EmailSubscriptionService {
  private readonly supabase = inject(SupabaseService);

  subscribe(email: string): Observable<SubscriptionResult> {
    if (this.supabase.shouldUseMockData()) {
      // El delay hace visible el estado de carga del formulario.
      return of({ ok: true }).pipe(delay(600));
    }

    return from(
      this.supabase.db.from('club_subscriptions').insert({ email: email.trim().toLowerCase() }),
    ).pipe(
      map((res) => {
        // 23505 = ya está suscrito. Para el usuario eso es un éxito, no un error.
        if (res.error && res.error.code !== '23505') {
          console.error('[supabase]', res.error);
          throw new Error(translateDbError(res.error));
        }
        return { ok: true };
      }),
    );
  }
}
