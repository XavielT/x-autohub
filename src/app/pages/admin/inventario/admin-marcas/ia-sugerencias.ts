import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { AdminCatalogService } from '../../../../../shared/services/admin-catalog.service';
import { AiSearchService, AliasProposal, ModelProposal } from '../../../../../shared/services/ai-search.service';
import { ToastService } from '../../../../../shared/services/toast.service';

/**
 * Propuestas de la IA para el catálogo (migración 0054): modelos escritos a mano en los garajes y alias de producto salidos de las búsquedas sin
 * resultado. La IA solo propone: cada fila se aplica con un clic del admin y por el camino que ya existía (`admin_create_vehicle_model`,
 * `admin_assign_vehicle_model` y `product_aliases`). Nada se aplica solo.
 */
@Component({
  selector: 'app-ia-sugerencias',
  imports: [DecimalPipe],
  templateUrl: './ia-sugerencias.html',
  styleUrl: './ia-sugerencias.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IaSugerencias {
  private readonly aiSearch = inject(AiSearchService);
  private readonly catalog = inject(AdminCatalogService);
  private readonly toast = inject(ToastService);

  /** Avisa al padre que cambió el catálogo (para refrescar la lista de modelos sin asignar). */
  readonly changed = output<void>();

  readonly models = signal<ModelProposal[] | null>(null);
  readonly aliases = signal<AliasProposal[] | null>(null);
  readonly busy = signal<'models' | 'aliases' | null>(null);
  readonly applying = signal<string | null>(null);

  loadModels(): void {
    this.run('models', this.aiSearch.proposeModels(), (list) => this.models.set(list));
  }

  loadAliases(): void {
    this.run('aliases', this.aiSearch.proposeAliases(), (list) => this.aliases.set(list));
  }

  private run<T>(kind: 'models' | 'aliases', source: import('rxjs').Observable<T[]>, set: (list: T[]) => void): void {
    if (this.busy()) return;
    this.busy.set(kind);
    source.subscribe({
      next: (list) => {
        this.busy.set(null);
        set(list);
        if (list.length === 0) this.toast.show('La IA no tiene propuestas ahora (o no está disponible).');
      },
      error: () => {
        this.busy.set(null);
        this.toast.show('No pudimos pedir las propuestas.', 'error');
      },
    });
  }

  modelKey(p: ModelProposal): string {
    return `${p.makeId}|${p.modelText}`;
  }

  /** Un clic: asigna al modelo que ya existe, o crea el modelo (y pasa los garajes que lo escribieron). */
  applyModel(p: ModelProposal): void {
    if (this.applying()) return;
    this.applying.set(this.modelKey(p));
    const done = (message: string) => {
      this.applying.set(null);
      this.models.update((l) => (l ?? []).filter((x) => this.modelKey(x) !== this.modelKey(p)));
      this.toast.show(message);
      this.changed.emit();
    };
    const fail = (e: Error) => {
      this.applying.set(null);
      this.toast.show(e.message, 'error');
    };

    if (p.canonical) {
      this.catalog.assignModelFromText(p.makeId, p.modelText, p.canonical.id).subscribe({
        next: (n) => done(`"${p.modelText}" ahora es ${p.makeName} ${p.canonical!.name}; ${n} garaje(s) actualizado(s).`),
        error: fail,
      });
    } else if (p.createName) {
      this.catalog.createModelFromText(p.makeId, p.createName).subscribe({
        next: ({ model, migrated }) => done(`${p.makeName} ${model.name} creado; ${migrated} garaje(s) actualizado(s).`),
        error: fail,
      });
    }
  }

  discardModel(p: ModelProposal): void {
    this.models.update((l) => (l ?? []).filter((x) => this.modelKey(x) !== this.modelKey(p)));
  }

  aliasKey(p: AliasProposal): string {
    return `${p.productId}|${p.alias}`;
  }

  applyAlias(p: AliasProposal): void {
    if (this.applying()) return;
    this.applying.set(this.aliasKey(p));
    this.catalog.addAlias(p.productId, p.alias).subscribe({
      next: () => {
        this.applying.set(null);
        this.aliases.update((l) => (l ?? []).filter((x) => this.aliasKey(x) !== this.aliasKey(p)));
        this.toast.show(`Alias "${p.alias}" agregado a ${p.productName}.`);
      },
      error: (e: Error) => {
        this.applying.set(null);
        this.toast.show(e.message, 'error');
      },
    });
  }

  discardAlias(p: AliasProposal): void {
    this.aliases.update((l) => (l ?? []).filter((x) => this.aliasKey(x) !== this.aliasKey(p)));
  }
}
