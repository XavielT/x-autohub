import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { ApproveInput, Confidence, DraftFitment, FIELD_LABELS, ProductDraft } from '../../../../../shared/models/ai-catalog.model';
import { ProductCategoryModel } from '../../../../../shared/models/product.model';
import { AdminCatalogService } from '../../../../../shared/services/admin-catalog.service';
import { AiCatalogService } from '../../../../../shared/services/ai-catalog.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { VehicleService } from '../../../../../shared/services/vehicle.service';

const MAX_FILES = 30;
const POLL_MS = 4000;

/** Lo que se edita de un borrador mientras se revisa. */
interface DraftEdit {
  name: string;
  brand: string;
  categoryId: number | null;
  partNumber: string;
  /** Las impresas salen marcadas; las "sin verificar" (conocimiento general) desmarcadas. */
  crossRefs: { value: string; on: boolean; unverified: boolean }[];
  shortDescription: string;
  description: string;
  price: string;
  stock: string;
  specsText: string;
  fitmentType: 'universal' | 'specific';
  fitments: DraftFitment[];
  aliasesText: string;
  photoIndices: number[];
  duplicateConfirmed: boolean;
  hint: string;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const toSpecs = (t: string): Record<string, string> =>
  Object.fromEntries(
    t.split('\n').flatMap((line) => {
      const i = line.indexOf(':');
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      return i > 0 && key && value ? [[key, value] as [string, string]] : [];
    }),
  );

/**
 * /admin/inventario/cargar-ia — "subo la pieza y el sistema la lee".
 *
 * 1) Se suben las fotos (cámara o galería; hasta 30 de golpe, la IA propone cómo agruparlas por artículo y se corrige a
 * mano), 2) la edge las lee en segundo plano y esta pantalla sigue el estado, 3) cola de revisión: los dudosos arriba, lo
 * que falta en rojo, 4) el admin aprueba. La IA no crea nada: aprobar usa el camino de siempre del panel.
 */
@Component({
  selector: 'app-admin-cargar-ia',
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-cargar-ia.html',
  styleUrl: './admin-cargar-ia.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCargarIa implements OnInit {
  private readonly catalogAi = inject(AiCatalogService);
  private readonly catalog = inject(AdminCatalogService);
  private readonly vehicles = inject(VehicleService);
  private readonly toast = inject(ToastService);

  readonly available = this.catalogAi.isAvailable();
  readonly labels = FIELD_LABELS;
  readonly maxFiles = MAX_FILES;

  readonly kind = signal<'article' | 'list'>('article');
  readonly files = signal<File[]>([]);
  readonly previews = signal<string[]>([]);
  /** Número de artículo (grupo) de cada foto, empezando en 1. */
  readonly groupOf = signal<number[]>([]);
  readonly isBusy = signal(false);
  readonly isGrouping = signal(false);

  readonly drafts = signal<ProductDraft[]>([]);
  readonly urls = signal<Record<string, string>>({});
  readonly categories = signal<ProductCategoryModel[]>([]);
  readonly edits = signal<Record<string, DraftEdit>>({});
  readonly approving = signal<string | null>(null);
  private readonly names = signal<Record<string, string>>({});

  /** Los dudosos (confianza baja, duplicados, faltantes) primero. */
  readonly ordered = computed(() =>
    [...this.drafts()].sort((a, b) => this.doubt(b) - this.doubt(a) || b.createdAt.getTime() - a.createdAt.getTime()),
  );
  readonly working = computed(() => this.drafts().some((d) => d.status === 'queued' || d.status === 'processing'));
  readonly groupCount = computed(() => new Set(this.groupOf()).size);

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stopPolling();
      for (const url of this.previews()) URL.revokeObjectURL(url);
    });
  }

  ngOnInit(): void {
    this.catalog.getCategories().subscribe((cats) => this.categories.set(cats));
    this.refresh();
  }

  // --- 1. Subir ----------------------------------------------------------------------------

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    if (picked.length === 0) return;

    const room = MAX_FILES - this.files().length;
    if (picked.length > room) this.toast.show(`Máximo ${MAX_FILES} archivos por vez.`, 'error');
    const added = picked.slice(0, Math.max(0, room));
    this.files.update((f) => [...f, ...added]);
    this.previews.update((p) => [...p, ...added.map((f) => (f.type === 'application/pdf' ? '' : URL.createObjectURL(f)))]);
    // Hasta 8 fotos es un solo artículo; con más, de a 4 por artículo hasta que se agrupe con IA o a mano.
    const base = this.files().length - added.length;
    this.groupOf.update((g) => [
      ...g,
      ...added.map((_, i) => (this.files().length <= 8 || this.kind() === 'list' ? 1 : Math.floor((base + i) / 4) + 1)),
    ]);
  }

  removeFile(index: number): void {
    URL.revokeObjectURL(this.previews()[index] ?? '');
    this.files.update((f) => f.filter((_, i) => i !== index));
    this.previews.update((p) => p.filter((_, i) => i !== index));
    this.groupOf.update((g) => g.filter((_, i) => i !== index));
  }

  setGroup(index: number, event: Event): void {
    const value = Math.max(1, Math.min(MAX_FILES, Number((event.target as HTMLInputElement).value) || 1));
    this.groupOf.update((g) => g.map((x, i) => (i === index ? value : x)));
  }

  /** La IA propone la agrupación; la sube a Storage y se la devuelve al admin para corregirla. */
  groupWithAi(): void {
    if (this.isGrouping() || this.files().length === 0) return;
    this.isGrouping.set(true);
    const batch = crypto.randomUUID();
    this.catalogAi.uploadSources(this.files(), batch).subscribe({
      next: (paths) =>
        this.catalogAi.groupPaths(paths).subscribe((groups) => {
          this.isGrouping.set(false);
          // Se subieron para agrupar: se reusan al procesar, sin volver a subirlas.
          this.uploadedPaths = paths;
          if (!groups) return void this.toast.show('La IA no pudo agrupar ahora. Agrupa a mano.', 'error');
          const next = Array(paths.length).fill(1);
          groups.forEach((g, gi) => g.forEach((i) => (next[i] = gi + 1)));
          this.groupOf.set(next);
          this.toast.show(`La IA propone ${groups.length} artículo(s). Revisa y corrige antes de procesar.`);
        }),
      error: (e: Error) => {
        this.isGrouping.set(false);
        this.toast.show(e.message, 'error');
      },
    });
  }
  private uploadedPaths: string[] | null = null;

  process(): void {
    if (this.isBusy() || this.files().length === 0) return;
    this.isBusy.set(true);
    const batch = crypto.randomUUID();
    const sources$ = this.uploadedPaths?.length === this.files().length ? of(this.uploadedPaths) : this.catalogAi.uploadSources(this.files(), batch);

    sources$.subscribe({
      next: (paths) => {
        const byGroup = new Map<number, string[]>();
        this.groupOf().forEach((g, i) => byGroup.set(g, [...(byGroup.get(g) ?? []), paths[i]]));
        // Una lista admite un solo juego de páginas: un borrador, y la IA saca un borrador por renglón.
        const groups = [...byGroup.values()].map((g) => g.slice(0, 8));
        this.catalogAi.createDrafts(groups, this.kind(), batch).subscribe({
          next: (ids) =>
            this.catalogAi.process(ids).subscribe((queued) => {
              this.isBusy.set(false);
              if (!queued) this.toast.show('La IA no está disponible ahora. Los borradores quedaron en cola.', 'error');
              this.clearUploads();
              this.refresh();
            }),
          error: () => this.failBusy('No pudimos crear los borradores.'),
        });
      },
      error: (e: Error) => this.failBusy(e.message),
    });
  }

  // --- 2. Estado -----------------------------------------------------------------------------

  refresh(): void {
    this.catalogAi.list().subscribe({
      next: (drafts) => {
        this.drafts.set(drafts);
        this.hydrate(drafts);
        this.catalogAi.signedUrls(drafts.flatMap((d) => d.sourcePaths)).subscribe((u) => this.urls.update((all) => ({ ...all, ...u })));
        if (this.working()) this.startPolling();
        else this.stopPolling();
      },
      error: () => this.toast.show('No pudimos leer los borradores.', 'error'),
    });
  }

  private startPolling(): void {
    this.timer ??= setInterval(() => this.refresh(), POLL_MS);
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // --- 3. Revisar ------------------------------------------------------------------------------

  /** Cuánto hay que mirar un borrador: más = más arriba. */
  doubt(d: ProductDraft): number {
    if (d.status === 'failed') return 4;
    let score = 0;
    if (d.duplicateOf !== null) score += 3;
    for (const f of Object.values(d.fields)) if (f.confidence === 'baja' && f.value !== null) score += 1;
    if (d.fields['price']?.value === null) score += 1;
    return score;
  }

  chip(d: ProductDraft, key: string): { text: string; level: Confidence } | null {
    const f = d.fields[key];
    return f ? { text: `${f.confidence} · ${f.source}`, level: f.confidence } : null;
  }

  isMissing(d: ProductDraft, key: string): boolean {
    return d.fields[key]?.source === 'falta';
  }

  edit(d: ProductDraft): DraftEdit | undefined {
    return this.edits()[d.id];
  }

  patchEdit(id: string, change: Partial<DraftEdit>): void {
    this.edits.update((all) => ({ ...all, [id]: { ...all[id], ...change } }));
  }

  setText(id: string, key: 'name' | 'brand' | 'partNumber' | 'shortDescription' | 'description' | 'price' | 'stock' | 'specsText' | 'aliasesText' | 'hint', event: Event): void {
    this.patchEdit(id, { [key]: (event.target as HTMLInputElement | HTMLTextAreaElement).value });
  }

  setCategory(id: string, event: Event): void {
    const v = (event.target as HTMLSelectElement).value;
    this.patchEdit(id, { categoryId: v ? Number(v) : null });
  }

  toggleFitment(id: string, index: number): void {
    const e = this.edits()[id];
    this.patchEdit(id, { fitments: e.fitments.map((f, i) => (i === index ? { ...f, selected: !f.selected } : f)) });
  }

  toggleRef(id: string, index: number): void {
    const e = this.edits()[id];
    this.patchEdit(id, { crossRefs: e.crossRefs.map((r, i) => (i === index ? { ...r, on: !r.on } : r)) });
  }

  togglePhoto(id: string, index: number): void {
    const e = this.edits()[id];
    const has = e.photoIndices.includes(index);
    this.patchEdit(id, { photoIndices: has ? e.photoIndices.filter((i) => i !== index) : [...e.photoIndices, index] });
  }

  confirmDuplicate(id: string, event: Event): void {
    this.patchEdit(id, { duplicateConfirmed: (event.target as HTMLInputElement).checked });
  }

  categoryName(id: number | null): string {
    return this.categories().find((c) => c.id === id)?.name ?? '';
  }

  /** Lo obligatorio para publicar: nombre, marca, categoría, precio mayor que 0 y al menos una foto de producto. */
  canPublish(d: ProductDraft): boolean {
    const e = this.edit(d);
    if (!e) return false;
    return !!e.name.trim() && !!e.brand.trim() && e.categoryId !== null && Number(e.price) > 0 && Number(e.stock) >= 0 && e.photoIndices.length > 0;
  }

  canApprove(d: ProductDraft): boolean {
    const e = this.edit(d);
    if (!e) return false;
    return !!e.name.trim() && !!e.brand.trim() && Number(e.price) >= 0 && (d.duplicateOf === null || e.duplicateConfirmed);
  }

  approve(d: ProductDraft, publish: boolean): void {
    const e = this.edit(d);
    if (!e || this.approving()) return;
    if (publish && !this.canPublish(d)) return void this.toast.show('Para publicar faltan nombre, marca, categoría, precio y una foto.', 'error');

    const input: ApproveInput = {
      name: e.name,
      brand: e.brand,
      categoryId: e.categoryId,
      partNumber: e.partNumber,
      crossRefs: e.crossRefs.filter((r) => r.on).map((r) => r.value),
      shortDescription: e.shortDescription,
      description: e.description,
      price: Number(e.price) || 0,
      stock: Number(e.stock) || 0,
      specs: toSpecs(e.specsText),
      fitmentType: e.fitmentType,
      fitments: e.fitments.filter((f) => f.selected).map((f) => ({ makeId: f.make_id, modelId: f.model_id, yearFrom: f.year_from, yearTo: f.year_to })),
      aliases: e.aliasesText.split(',').map((a) => a.trim()).filter((a) => a.length >= 2),
      photoIndices: e.photoIndices,
      duplicateConfirmed: e.duplicateConfirmed,
      publish,
      editedFields: this.editedFields(d, e),
    };

    this.approving.set(d.id);
    this.catalogAi.approve(d, input).subscribe({
      next: () => {
        this.approving.set(null);
        this.toast.show(publish ? 'Producto publicado.' : 'Producto creado, queda inactivo hasta que lo publiques.');
        this.refresh();
      },
      error: (err: Error) => {
        this.approving.set(null);
        this.toast.show(err.message || 'No pudimos crear el producto.', 'error');
      },
    });
  }

  reread(d: ProductDraft): void {
    const hint = this.edit(d)?.hint ?? '';
    this.catalogAi.reread(d.id, hint).subscribe((ok) => {
      this.toast.show(ok ? 'Leyendo de nuevo…' : 'La IA no está disponible ahora.', ok ? 'success' : 'error');
      this.refresh();
    });
  }

  discard(d: ProductDraft): void {
    this.catalogAi.reject(d.id).subscribe({
      next: () => this.refresh(),
      error: () => this.toast.show('No pudimos descartar el borrador.', 'error'),
    });
  }

  fieldLabel(key: string): string {
    return FIELD_LABELS[key] ?? key;
  }

  // --- Internos ---------------------------------------------------------------------------------

  /** Qué campos cambió el humano respecto a lo que propuso la IA: de ahí sale la precisión por campo. */
  private editedFields(d: ProductDraft, e: DraftEdit): string[] {
    const f = d.fields;
    const changed: string[] = [];
    const diff = (key: string, now: unknown) => {
      if (JSON.stringify(f[key]?.value ?? null) !== JSON.stringify(now ?? null)) changed.push(key);
    };
    diff('name', e.name);
    diff('brand', e.brand);
    diff('part_number', e.partNumber || null);
    diff('category_id', e.categoryId);
    diff('short_description', e.shortDescription || null);
    diff('description', e.description || null);
    diff('price', e.price === '' ? null : Number(e.price));
    diff('stock', e.stock === '' ? null : Number(e.stock));
    diff('specs', toSpecs(e.specsText));
    diff('cross_refs', e.crossRefs.filter((r) => r.on && !r.unverified).map((r) => r.value));
    const proposed = list<DraftFitment>(f['fitments']?.value).filter((x) => x.selected).length;
    if (proposed !== e.fitments.filter((x) => x.selected).length) changed.push('fitments');
    return changed;
  }

  /** Prepara el estado editable de cada borrador nuevo, una sola vez (no pisa lo que el admin ya escribió). */
  private hydrate(drafts: ProductDraft[]): void {
    const known = this.edits();
    const fresh = drafts.filter((d) => d.status === 'ready' && !known[d.id]);
    if (fresh.length === 0) return;

    const makeIds = new Set(fresh.flatMap((d) => list<DraftFitment>(d.fields['fitments']?.value).map((f) => f.make_id)));
    this.buildEdits(fresh);
    this.vehicles.getMakes().subscribe((makes) => this.names.update((n) => ({ ...n, ...Object.fromEntries(makes.map((m) => [`m${m.id}`, m.name])) })));
    for (const id of makeIds) {
      this.vehicles.getModels(id).subscribe((models) => this.names.update((n) => ({ ...n, ...Object.fromEntries(models.map((m) => [`o${m.id}`, m.name])) })));
    }
  }

  private buildEdits(drafts: ProductDraft[]): void {
    this.edits.update((all) => {
      const next = { ...all };
      for (const d of drafts) {
        if (next[d.id]) continue;
        const f = d.fields;
        const fitments = list<DraftFitment>(f['fitments']?.value);
        const refs = [
          ...list<string>(f['cross_refs']?.value).map((value) => ({ value, on: true, unverified: false })),
          ...list<string>(f['cross_refs_unverified']?.value).map((value) => ({ value, on: false, unverified: true })),
        ];
        const order = list<number>(f['photo_order']?.value);
        next[d.id] = {
          name: text(f['name']?.value),
          brand: text(f['brand']?.value),
          categoryId: typeof f['category_id']?.value === 'number' ? (f['category_id'].value as number) : null,
          partNumber: text(f['part_number']?.value),
          crossRefs: refs,
          shortDescription: text(f['short_description']?.value),
          description: text(f['description']?.value),
          price: f['price']?.value == null ? '' : String(f['price'].value),
          stock: f['stock']?.value == null ? '' : String(f['stock'].value),
          specsText: Object.entries((f['specs']?.value ?? {}) as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join('\n'),
          fitmentType: f['fitment_type']?.value === 'universal' ? 'universal' : 'specific',
          fitments,
          aliasesText: list<string>(f['aliases']?.value).join(', '),
          photoIndices: d.sourceKind === 'list' ? [] : order.length ? order : d.sourcePaths.map((_, i) => i),
          duplicateConfirmed: d.duplicateConfirmed,
          hint: '',
        };
      }
      return next;
    });
  }

  fitmentLabel(f: DraftFitment): string {
    const names = this.names();
    const years = f.year_from ? (f.year_to && f.year_to !== f.year_from ? `${f.year_from}–${f.year_to}` : `${f.year_from}`) : '';
    return [names[`m${f.make_id}`] ?? 'Marca', f.model_id ? (names[`o${f.model_id}`] ?? 'Modelo') : 'todos los modelos', years].filter(Boolean).join(' ');
  }

  private clearUploads(): void {
    for (const url of this.previews()) URL.revokeObjectURL(url);
    this.files.set([]);
    this.previews.set([]);
    this.groupOf.set([]);
    this.uploadedPaths = null;
  }

  private failBusy(message: string): void {
    this.isBusy.set(false);
    this.toast.show(message, 'error');
  }
}
