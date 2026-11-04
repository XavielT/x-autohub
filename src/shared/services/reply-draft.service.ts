import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AiService } from './ai.service';

export type ReplyKind = 'order' | 'appointment' | 'quote';

/**
 * Los borradores de WhatsApp para quien atiende (edge `ai-draft-reply`). No hay bot ni API de Meta: la IA ayuda a redactar y quien atiende toca "enviar" en
 * WhatsApp. Si la IA no está (o el borrador traía un enlace o un número inventado), devuelve `null` y la pantalla usa la plantilla sin IA.
 */
@Injectable({ providedIn: 'root' })
export class ReplyDraftService {
  private readonly ai = inject(AiService);

  /** Un borrador de la IA, o `null`. `variant` 1 a 3 ("Otra versión"). */
  draft(kind: ReplyKind, id: string, variant = 1): Observable<string | null> {
    return this.ai.call<{ message: string }>('ai-draft-reply', { kind, id, variant }).pipe(map((out) => (out.ok ? out.data.message : null)));
  }
}
