import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, map, of, switchMap, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { AiProductDraftRow } from '../../core/supabase/database.types';
import { unwrap } from '../../core/supabase/supabase-error';
import { ApproveInput, DraftField, FieldAccuracy, ProductDraft } from '../models/ai-catalog.model';
import { NewPartDraft } from '../models/admin-inventory.model';
import { compressImage } from '../utils/image-compress';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminService } from './admin.service';
import { AiService } from './ai.service';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';

export const AI_SOURCES_BUCKET = 'ai-product-sources';
/** Las fotos que se le mandan a la IA se bajan a este borde largo antes de subirlas (la edge solo exige un tope de bytes). */
export const AI_IMAGE_EDGE = 1280;

const NOT_AVAILABLE = 'El catálogo asistido necesita la base real: en modo de prueba no está disponible.';

/**
 * El catálogo asistido (migración 0051): sube las fotos de origen, crea los borradores en cola, pide a la Edge Function
 * `ai-product-ingest` que los lea y, cuando el admin revisa y aprueba, crea el producto **por el mismo camino del panel**
 * (`AdminService.createPart` y las altas de compatibilidades y alias de `AdminCatalogService`), sin duplicar sus reglas.
 *
 * La IA nunca crea ni publica nada: un borrador aprobado es una decisión de una persona.
 */
@Injectable({ providedIn: 'root' })
export class AiCatalogService {
  private readonly supabase = inject(SupabaseService);
  private readonly ai = inject(AiService);
  private readonly admin = inject(AdminService);
  private readonly catalog = inject(AdminCatalogService);
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);

  /** En modo simulado no hay Storage ni edge: la pantalla lo dice en vez de fallar. */
  isAvailable(): boolean {
    return !this.supabase.shouldUseMockData();
  }

  /** Comprime cada foto a 1280 px y la sube a la carpeta del admin. Devuelve las rutas, en el mismo orden. */
  uploadSources(files: File[], batchId: string): Observable<string[]> {
    const uid = this.auth.currentUserId();
    if (!this.isAvailable() || !uid) return throwError(() => new Error(NOT_AVAILABLE));

    return from(this.supabase.client()).pipe(
      switchMap((client) =>
        forkJoin(
          files.map((file, i) =>
            from(file.type === 'application/pdf' ? Promise.resolve(file) : compressImage(file, AI_IMAGE_EDGE)).pipe(
              switchMap((ready) => {
                const ext = ready.type === 'application/pdf' ? 'pdf' : 'jpg';
                const path = `${uid}/${batchId}/${String(i).padStart(2, '0')}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                return from(client.storage.from(AI_SOURCES_BUCKET).upload(path, ready, { upsert: false })).pipe(
                  map((res) => {
                    if (res.error) throw new Error('No pudimos subir una de las fotos. Intenta de nuevo.');
                    return res.data.path;
                  }),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }

  /** Pide a la IA que agrupe las fotos de un lote por artículo. `null` si no pudo (el admin agrupa a mano). */
  groupPaths(paths: string[]): Observable<number[][] | null> {
    return this.ai
      .call<{ groups: number[][] }>('ai-product-ingest', { action: 'group', paths })
      .pipe(map((out) => (out.ok ? out.data.groups : null)));
  }

  /** Crea un borrador en cola por grupo de fotos. */
  createDrafts(groups: string[][], kind: 'article' | 'list', batchId: string): Observable<string[]> {
    const uid = this.auth.currentUserId();
    if (!this.isAvailable() || !uid) return throwError(() => new Error(NOT_AVAILABLE));

    const rows = groups.map((paths) => ({ created_by: uid, source_paths: paths, source_kind: kind, batch_id: batchId }));
    return from(this.supabase.db.from('ai_product_drafts').insert(rows).select('id')).pipe(
      map((res) => unwrap(res).map((r) => r.id)),
    );
  }

  /** Manda a leer los borradores. En segundo plano: la respuesta solo dice si se encoló. */
  process(ids: string[]): Observable<boolean> {
    return this.ai.call('ai-product-ingest', { action: 'process', draft_ids: ids }).pipe(map((out) => out.ok));
  }

  reread(id: string, hint: string): Observable<boolean> {
    return this.ai.call('ai-product-ingest', { action: 'reread', draft_id: id, hint }).pipe(map((out) => out.ok));
  }

  /** Los borradores por revisar (o los de un lote), del más nuevo al más viejo. */
  list(batchId?: string): Observable<ProductDraft[]> {
    if (!this.isAvailable()) return of([]);

    let query = this.supabase.db.from('ai_product_drafts').select('*');
    query = batchId ? query.eq('batch_id', batchId) : query.in('status', ['queued', 'processing', 'ready', 'failed']);
    return from(query.order('created_at', { ascending: false }).limit(60)).pipe(map((res) => unwrap(res).map(toDraft)));
  }

  /** URLs firmadas (1 hora) de las fotos de origen, por ruta. */
  signedUrls(paths: string[]): Observable<Record<string, string>> {
    if (!this.isAvailable() || paths.length === 0) return of({});
    return from(this.supabase.client()).pipe(
      switchMap((client) => from(client.storage.from(AI_SOURCES_BUCKET).createSignedUrls(paths, 3600))),
      map((res) =>
        Object.fromEntries(
          (res.data ?? []).flatMap((e) => (e.signedUrl && e.path ? [[e.path, e.signedUrl] as [string, string]] : [])),
        ),
      ),
    );
  }

  reject(id: string): Observable<void> {
    return from(this.supabase.db.from('ai_product_drafts').update({ status: 'rejected' }).eq('id', id)).pipe(
      map((res) => {
        unwrap(res);
      }),
    );
  }

  /**
   * Aprueba un borrador: copia las fotos elegidas al bucket público del inventario, crea el producto con el camino del
   * panel (queda inactivo salvo que se pida publicar), le pone compatibilidades y alias, y anota en el borrador qué campos
   * cambió el humano. Devuelve el id del producto.
   */
  approve(draft: ProductDraft, input: ApproveInput): Observable<number> {
    if (!this.isAvailable()) return throwError(() => new Error(NOT_AVAILABLE));
    if (draft.duplicateOf !== null && !input.duplicateConfirmed) {
      return throwError(() => new Error('Parece un duplicado: confirma que es otro artículo antes de aprobar.'));
    }

    const paths = input.photoIndices.map((i) => draft.sourcePaths[i]).filter((p): p is string => !!p && !p.endsWith('.pdf'));

    return this.downloadFiles(paths).pipe(
      switchMap((files) => this.storage.uploadInventoryImages(files, 'piezas')),
      switchMap((images) => {
        // Sin fotos del producto (una lista de proveedor no las trae) no se puede publicar: queda inactivo.
        const publish = input.publish && images.length > 0;
        const part: NewPartDraft = {
          categoryId: input.categoryId,
          slug: '',
          sku: '',
          partNumber: input.partNumber,
          crossRefs: input.crossRefs,
          name: input.name,
          brand: input.brand,
          shortDescription: input.shortDescription,
          imgUrl: images[0] ?? '',
          images,
          price: input.price,
          compareAtPrice: null,
          description: input.description,
          stock: input.stock,
          isFeatured: false,
          fulfillment: 'stock',
          leadTimeDays: null,
          fitmentType: input.fitmentType,
          installable: false,
          installationServiceId: null,
          variantLabel: '',
          specs: input.specs,
          isActive: publish,
          isTest: false,
        };
        return this.admin.createPart(part);
      }),
      switchMap((created) => {
        const steps: Observable<unknown>[] = [];
        if (input.fitmentType === 'specific' && input.fitments.length > 0) {
          steps.push(this.catalog.replaceFitments(created.id, input.fitments));
        }
        for (const alias of input.aliases) steps.push(this.catalog.addAlias(created.id, alias));
        return (steps.length ? forkJoin(steps) : of([])).pipe(map(() => created.id));
      }),
      switchMap((productId) =>
        from(
          this.supabase.db
            .from('ai_product_drafts')
            .update({
              status: 'approved',
              product_id: productId,
              duplicate_confirmed: input.duplicateConfirmed,
              edited_fields: input.editedFields,
              final_fields: { name: input.name, brand: input.brand, price: input.price, stock: input.stock },
            })
            .eq('id', draft.id),
        ).pipe(
          map((res) => {
            unwrap(res);
            return productId;
          }),
        ),
      ),
    );
  }

  /**
   * "Sugerir SEO": la IA propone título, descripción, texto alterno y preguntas frecuentes de una ficha ya creada. Solo se llenan los campos VACÍOS (lo escrito por
   * una persona no se pisa). `null` si la IA no está.
   */
  suggestSeo(kind: 'product' | 'service', id: number): Observable<{ applied: Record<string, boolean>; seoTitle: string; seoDescription: string } | null> {
    return this.ai.call<{ applied: Record<string, boolean>; seo_title: string; seo_description: string }>('ai-seo-product', { kind, id }).pipe(
      map((out) => (out.ok ? { applied: out.data.applied, seoTitle: out.data.seo_title, seoDescription: out.data.seo_description } : null)),
    );
  }

  /** Precisión por campo: de lo aprobado, cuántas veces la IA acertó sin que nadie lo cambiara. */
  accuracy(): Observable<FieldAccuracy[]> {
    if (!this.isAvailable()) return of([]);
    return from(this.supabase.db.rpc('ai_catalog_accuracy')).pipe(
      map((res) => unwrap(res).map((r) => ({ field: r.field, total: Number(r.total), unchanged: Number(r.unchanged), pct: Number(r.pct) }))),
    );
  }

  private downloadFiles(paths: string[]): Observable<File[]> {
    if (paths.length === 0) return of([]);
    return from(this.supabase.client()).pipe(
      switchMap((client) =>
        forkJoin(
          paths.map((path) =>
            from(client.storage.from(AI_SOURCES_BUCKET).download(path)).pipe(
              map((res) => {
                if (res.error || !res.data) throw new Error('No pudimos abrir una de las fotos de origen.');
                return new File([res.data], path.split('/').pop() ?? 'foto.jpg', { type: res.data.type || 'image/jpeg' });
              }),
            ),
          ),
        ),
      ),
    );
  }
}

export function toDraft(row: AiProductDraftRow): ProductDraft {
  return {
    id: row.id,
    status: row.status,
    sourceKind: row.source_kind,
    sourcePaths: row.source_paths,
    batchId: row.batch_id,
    hint: row.hint,
    fields: (row.fields ?? {}) as Record<string, DraftField>,
    unmatched: row.unmatched ?? [],
    duplicateOf: row.duplicate_of,
    duplicateConfirmed: row.duplicate_confirmed,
    error: row.error,
    costUsd: Number(row.cost_usd),
    createdAt: new Date(row.created_at),
  };
}
