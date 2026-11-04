import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { AiDigestRow } from '../../core/supabase/database.types';
import { unwrap } from '../../core/supabase/supabase-error';
import { AiService } from './ai.service';

/** El resumen "Hoy en el negocio" de un día (migración 0056). */
export interface Digest {
  id: number;
  date: string;
  kind: 'diario' | 'lunes';
  body: string;
  /** Lo escribió la IA; si no, es la plantilla con los mismos números de la base. */
  aiGenerated: boolean;
  createdAt: Date;
}

/** Un trozo de una línea del resumen: texto, negrita o enlace a una ruta de /admin. */
export interface DigestPart {
  text: string;
  bold?: boolean;
  link?: string;
}

export interface DigestLine {
  kind: 'bullet' | 'numbered' | 'heading' | 'text';
  parts: DigestPart[];
}

/**
 * El resumen diario del negocio (migración 0056). Lo escribe la edge `ai-daily-digest` a las 7:30 a. m. de RD; aquí solo se lee, y un admin puede pedir que se
 * genere ahora. Los números son de la base; la IA solo redacta.
 */
@Injectable({ providedIn: 'root' })
export class DigestService {
  private readonly supabase = inject(SupabaseService);
  private readonly ai = inject(AiService);

  /** Los últimos resúmenes, el de hoy primero. En modo simulado no hay ninguno. */
  getRecent(limit = 14): Observable<Digest[]> {
    if (this.supabase.shouldUseMockData()) return of([]);
    return from(
      this.supabase.db.from('ai_digests').select('id, digest_date, kind, body_md, ai_generated, created_at').order('digest_date', { ascending: false }).limit(limit),
    ).pipe(map((res) => unwrap(res).map(toDigest)));
  }

  /** "Generar ahora": pide el de hoy a la edge. `false` si no se pudo (la IA o la función no están). */
  generateNow(): Observable<boolean> {
    return this.ai.call('ai-daily-digest', {}).pipe(map((out) => out.ok));
  }
}

export function toDigest(row: Pick<AiDigestRow, 'id' | 'digest_date' | 'kind' | 'body_md' | 'ai_generated' | 'created_at'>): Digest {
  return { id: row.id, date: row.digest_date, kind: row.kind, body: row.body_md, aiGenerated: row.ai_generated, createdAt: new Date(row.created_at) };
}

const LINK = /\[([^\]]+)\]\((\/admin[a-z0-9/\-]*)\)/g;

/** Trocea una línea con `**negrita**` y `[texto](/admin/ruta)`. Solo enlaza rutas de /admin; cualquier otro enlace queda como texto. */
function parts(line: string): DigestPart[] {
  const out: DigestPart[] = [];
  const pieces = line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]*\))/g);
  for (const piece of pieces) {
    if (!piece) continue;
    if (piece.startsWith('**') && piece.endsWith('**')) {
      out.push({ text: piece.slice(2, -2), bold: true });
      continue;
    }
    const link = [...piece.matchAll(LINK)][0];
    if (link && piece === link[0]) {
      out.push({ text: link[1], link: link[2] });
      continue;
    }
    // Un corchete con un enlace que no es de /admin se queda como texto plano (nada de enlaces a otros sitios).
    out.push({ text: piece.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') });
  }
  return out;
}

/** El cuerpo en Markdown mínimo → líneas que la pantalla pinta sin `innerHTML`. */
export function renderDigest(body: string): DigestLine[] {
  return body
    .split('\n')
    .map((raw) => raw.trim())
    .filter((raw) => raw !== '')
    .map((raw): DigestLine => {
      if (/^[-•]\s+/.test(raw)) return { kind: 'bullet', parts: parts(raw.replace(/^[-•]\s+/, '')) };
      if (/^\d+\.\s+/.test(raw)) return { kind: 'numbered', parts: parts(raw.replace(/^\d+\.\s+/, '')) };
      if (/^\*\*[^*]+\*\*$/.test(raw)) return { kind: 'heading', parts: parts(raw) };
      return { kind: 'text', parts: parts(raw) };
    });
}
