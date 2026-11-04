import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ServiceModel } from '../../../../../shared/models/service.model';
import { AuthService } from '../../../../../shared/services/auth.service';
import { QUOTE_STATUS_FLOW, QuoteRequest, QuoteService, QuoteStatus } from '../../../../../shared/services/quote.service';
import { ServiceCatalogService } from '../../../../../shared/services/service-catalog.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { SITE_URL } from '../../../../../shared/utils/structured-data';
import { formatDrPhone } from '../../../../../shared/utils/phone';
import { quoteReplyDraft, scheduleLinkDraft, waLinkFor } from '../../../../../shared/utils/reply-templates';
import { SAFETY_NOTE } from '../../../../../shared/utils/quote-safety';
import { Skeleton } from '../../../../../shared/ui/skeleton/skeleton';
import { WaDraft } from '../../../../../shared/components/wa-draft/wa-draft';

/**
 * /admin/taller/solicitudes — las solicitudes de cotización (migración 0055).
 *
 * Una tarjeta por solicitud: lo que dijo el cliente, sus fotos (enlaces firmados: el bucket es privado), el triage de la IA (servicios probables, urgencia,
 * un resumen para el mecánico, qué falta preguntar y una lista orientativa) y los pasos del flujo. La IA no da precios: si el servicio tiene "desde RD$",
 * sale de la base. Responder y mandar el enlace de agendar abren WhatsApp con un borrador: no hay bot, y nada se manda hasta que quien atiende toca "enviar".
 */
@Component({
  selector: 'app-admin-solicitudes',
  imports: [DatePipe, DecimalPipe, Skeleton, WaDraft],
  templateUrl: './admin-solicitudes.html',
  styleUrl: './admin-solicitudes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSolicitudes implements OnInit {
  private readonly quotes = inject(QuoteService);
  private readonly catalog = inject(ServiceCatalogService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly statuses = QUOTE_STATUS_FLOW;
  readonly safetyNote = SAFETY_NOTE;

  readonly requests = signal<QuoteRequest[]>([]);
  readonly services = signal<ServiceModel[]>([]);
  readonly photoUrls = signal<Record<string, string>>({});
  readonly filter = signal<QuoteStatus | 'activas'>('activas');
  readonly isLoading = signal(true);
  readonly savingId = signal<string | null>(null);

  readonly counts = computed(() => {
    const counts: Partial<Record<QuoteStatus, number>> = {};
    for (const r of this.requests()) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  });

  /** "Activas" = lo que todavía pide algo del equipo: nuevas, vistas y respondidas. Las de seguridad van primero. */
  readonly shown = computed(() => {
    const f = this.filter();
    const list = this.requests().filter((r) => (f === 'activas' ? ['nueva', 'vista', 'respondida'].includes(r.status) : r.status === f));
    const rank = (r: QuoteRequest) => (r.urgency === 'seguridad' ? 0 : r.status === 'nueva' ? 1 : 2);
    return [...list].sort((a, b) => rank(a) - rank(b));
  });

  ngOnInit(): void {
    this.catalog.getServices().subscribe({ next: (s) => this.services.set(s), error: () => undefined });
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    this.quotes.list().subscribe({
      next: (list) => {
        this.requests.set(list);
        this.isLoading.set(false);
        this.quotes.photoUrls(list.flatMap((r) => r.photos)).subscribe((u) => this.photoUrls.set(u));
      },
      error: (e: Error) => {
        this.isLoading.set(false);
        this.toast.show(e.message, 'error');
      },
    });
  }

  setFilter(value: QuoteStatus | 'activas'): void {
    this.filter.set(value);
  }

  statusLabel(status: QuoteStatus): string {
    return this.statuses.find((s) => s.value === status)?.label ?? status;
  }

  serviceOf(id: number | null): ServiceModel | null {
    return id === null ? null : (this.services().find((s) => s.id === id) ?? null);
  }

  phoneText(phone: string): string {
    return formatDrPhone(phone);
  }

  setStatus(request: QuoteRequest, status: QuoteStatus): void {
    if (this.savingId() !== null || request.status === status) return;
    this.savingId.set(request.id);
    this.quotes.setStatus(request.id, status, this.auth.currentUserId()).subscribe({
      next: () => {
        this.savingId.set(null);
        this.requests.update((all) => all.map((r) => (r.id === request.id ? { ...r, status } : r)));
      },
      error: (e: Error) => {
        this.savingId.set(null);
        this.toast.show(e.message, 'error');
      },
    });
  }

  /** La plantilla sin IA de "Responder por WhatsApp" (el respaldo del borrador de la IA): el código y lo que falta preguntar. */
  replyFallback(r: QuoteRequest): string {
    return quoteReplyDraft({ name: r.name, code: r.code, missingInfo: r.triage?.missing_info });
  }

  /** El enlace directo con la plantilla (sin pasar por el borrador). */
  replyLink(r: QuoteRequest): string {
    return waLinkFor(r.phone, this.replyFallback(r));
  }

  /** "Enviar enlace para agendar": con el servicio ya preseleccionado (el que pidió el cliente o el más probable del triage). */
  scheduleLink(r: QuoteRequest): string {
    const wanted = this.serviceOf(r.serviceId) ?? this.services().find((s) => s.slug === r.triage?.services[0]?.slug) ?? null;
    const link = `${SITE_URL}/servicios/agendar${wanted ? `?service=${wanted.id}` : ''}`;
    return waLinkFor(r.phone, scheduleLinkDraft({ name: r.name, code: r.code, link }));
  }

  /** Marcar como vista al abrir el WhatsApp: ya se la atendió alguien. */
  markReplied(r: QuoteRequest): void {
    if (r.status === 'nueva' || r.status === 'vista') this.setStatus(r, 'respondida');
  }
}
