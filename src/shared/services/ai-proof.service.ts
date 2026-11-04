import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { OrderProofCheckRow } from '../../core/supabase/database.types';
import { unwrap } from '../../core/supabase/supabase-error';
import { ProofCheck, ProofExpected } from '../models/ai.model';
import { AiService } from './ai.service';

/**
 * La lectura asistida de comprobantes de transferencia (migración 0052). La IA **solo anota**: aquí no hay nada que cambie un
 * pedido ni su estado; confirmar el pago es de una persona, con `set_order_status()`.
 */
@Injectable({ providedIn: 'root' })
export class AiProofService {
  private readonly supabase = inject(SupabaseService);
  private readonly ai = inject(AiService);

  /** La lectura más reciente de cada pedido (los que no tienen, no aparecen). En modo simulado no hay ninguna. */
  getLatest(orderIds: string[]): Observable<Record<string, ProofCheck>> {
    if (this.supabase.shouldUseMockData() || orderIds.length === 0) return of({});

    return from(
      this.supabase.db
        .from('order_proof_checks')
        .select('id, order_id, proof_path, extracted, verdict, flags, reason, reference_hash, reference_last4, model, cost_usd, created_at')
        .in('order_id', orderIds)
        .order('created_at', { ascending: false }),
    ).pipe(
      map((res) => {
        const latest: Record<string, ProofCheck> = {};
        // Vienen del más nuevo al más viejo: la primera de cada pedido es la vigente.
        for (const row of unwrap(res)) latest[row.order_id] ??= toProofCheck(row);
        return latest;
      }),
    );
  }

  /** Lo que se esperaba del pedido: el total y las cuentas de X AutoHub (solo los últimos 4 dígitos). */
  getExpected(orderId: string): Observable<ProofExpected | null> {
    if (this.supabase.shouldUseMockData()) return of(null);
    return from(this.supabase.db.rpc('admin_order_expected', { p_order_id: orderId })).pipe(
      map((res) => {
        const e = unwrap(res);
        return { total: Number(e.total), accounts: e.accounts ?? [] };
      }),
    );
  }

  /** "Releer": le pide a la edge que vuelva a leer el comprobante. `false` si la IA no está disponible. */
  recheck(orderId: string): Observable<boolean> {
    return this.ai.call('ai-verify-proof', { order_id: orderId }).pipe(map((out) => out.ok));
  }
}

export function toProofCheck(row: OrderProofCheckRow): ProofCheck {
  const x = row.extracted ?? {};
  return {
    orderId: row.order_id,
    verdict: row.verdict,
    flags: row.flags ?? [],
    reason: row.reason,
    read: {
      amount: x.amount == null ? null : Number(x.amount),
      currency: x.currency ?? null,
      originBank: x.origin_bank ?? null,
      destBank: x.dest_bank ?? null,
      destLast4: x.dest_account_last4 ?? null,
      date: x.date ?? null,
      time: x.time ?? null,
    },
    referenceLast4: row.reference_last4,
    createdAt: new Date(row.created_at),
  };
}
