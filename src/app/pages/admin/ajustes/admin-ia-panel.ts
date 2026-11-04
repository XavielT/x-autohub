import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { SettingValue } from '../../../../core/supabase/database.types';
import { AI_FEATURES, AiFeatureInfo, AiOverview, AiTier } from '../../../../shared/models/ai.model';
import { FIELD_LABELS, FieldAccuracy } from '../../../../shared/models/ai-catalog.model';
import { AiCatalogService } from '../../../../shared/services/ai-catalog.service';
import { AiService } from '../../../../shared/services/ai.service';
import { SiteSettingsService } from '../../../../shared/services/site-settings.service';
import { ToastService } from '../../../../shared/services/toast.service';

const TIER_TEXT: Record<AiTier, string> = {
  ok: 'Todo en orden',
  aviso: 'Aviso: ya se usó el 80 % del tope',
  sin_publico: 'Las funciones abiertas a visitantes están apagadas (90 % del tope)',
  apagado: 'Tope alcanzado: la IA está apagada hasta el mes que viene',
};

/**
 * Sección "Inteligencia artificial" de /admin/ajustes (migración 0050): interruptor general, un interruptor por función,
 * el tope mensual, el gasto del mes por función y por día, y los últimos errores. Solo se ve en el panel, que es de admin.
 *
 * Las claves de Anthropic y Google no pasan por aquí: viven como secretos de las Edge Functions. Lo único que se cambia
 * desde el navegador son los interruptores y los topes (`set_site_setting()`, que comprueba el rol dentro de Postgres).
 */
@Component({
  selector: 'app-admin-ia-panel',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './admin-ia-panel.html',
  styleUrl: './admin-ia-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminIaPanel implements OnInit {
  private readonly ai = inject(AiService);
  private readonly catalogAi = inject(AiCatalogService);
  private readonly settings = inject(SiteSettingsService);
  private readonly toast = inject(ToastService);

  readonly features: readonly AiFeatureInfo[] = AI_FEATURES;
  readonly values = signal<Record<string, SettingValue>>({});
  readonly overview = signal<AiOverview | null>(null);
  readonly loadFailed = signal(false);
  readonly capDraft = signal('');
  readonly mapsCapDraft = signal('');
  readonly isSavingCap = signal(false);
  readonly accuracy = signal<FieldAccuracy[]>([]);

  readonly masterOn = computed(() => this.isOn('ai_enabled'));
  readonly tierText = computed(() => (this.overview() ? TIER_TEXT[this.overview()!.budget.tier] : ''));
  readonly maxDay = computed(() => Math.max(0.0001, ...(this.overview()?.byDay.map((d) => d.costUsd) ?? [0])));

  ngOnInit(): void {
    this.settings.getAiSettings().subscribe({
      next: (values) => {
        this.values.set(values);
        this.capDraft.set(String(values['ai_monthly_cap_usd'] ?? 25));
        this.mapsCapDraft.set(String(values['maps_monthly_cap_usd'] ?? 10));
      },
      error: () => this.loadFailed.set(true),
    });
    this.refresh();
    // La precisión del catálogo asistido: de lo aprobado, qué campos la IA acertó sin que nadie los cambiara.
    this.catalogAi.accuracy().subscribe({ next: (rows) => this.accuracy.set(rows), error: () => undefined });
  }

  /** Un interruptor que falta o no es un booleano se toma como encendido (igual que las edges). */
  isOn(key: string): boolean {
    return this.values()[key] !== false;
  }

  toggle(key: string): void {
    const next = !this.isOn(key);
    this.values.update((v) => ({ ...v, [key]: next }));
    this.settings.setAiSetting(key, next).subscribe({
      error: () => {
        // Se deshace: lo que se ve tiene que ser lo que quedó guardado.
        this.values.update((v) => ({ ...v, [key]: !next }));
        this.toast.show('No pudimos guardar el interruptor.', 'error');
      },
    });
  }

  setDraft(which: 'ai' | 'maps', event: Event): void {
    (which === 'ai' ? this.capDraft : this.mapsCapDraft).set((event.target as HTMLInputElement).value);
  }

  saveCaps(): void {
    if (this.isSavingCap()) return;
    const ai = Number(this.capDraft());
    const maps = Number(this.mapsCapDraft());
    if (!Number.isFinite(ai) || ai < 0 || !Number.isFinite(maps) || maps < 0) {
      this.toast.show('Los topes son montos en dólares, de 0 en adelante.', 'error');
      return;
    }

    this.isSavingCap.set(true);
    this.settings.setAiSetting('ai_monthly_cap_usd', ai).subscribe({
      next: () =>
        this.settings.setAiSetting('maps_monthly_cap_usd', maps).subscribe({
          next: () => {
            this.isSavingCap.set(false);
            this.toast.show('Topes guardados.');
            this.refresh();
          },
          error: () => this.failCaps(),
        }),
      error: () => this.failCaps(),
    });
  }

  fieldLabel(key: string): string {
    return (FIELD_LABELS as Record<string, string | undefined>)[key] ?? key;
  }

  featureLabel(key: string): string {
    return this.features.find((f) => f.key === key)?.label ?? key;
  }

  barWidth(cost: number): string {
    return `${Math.max(2, Math.round((cost / this.maxDay()) * 100))}%`;
  }

  private failCaps(): void {
    this.isSavingCap.set(false);
    this.toast.show('No pudimos guardar los topes.', 'error');
  }

  private refresh(): void {
    this.ai.getOverview().subscribe({
      next: (overview) => this.overview.set(overview),
      error: () => this.loadFailed.set(true),
    });
  }
}
