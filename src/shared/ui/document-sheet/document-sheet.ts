import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  BusinessProfile,
  DocumentDraft,
  DocumentLine,
  KIND_LABELS,
  LINE_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  STATUS_LABELS,
  VERDICT_LABELS,
} from '../../models/business-document.model';
import { BankAccount } from '../../models/order.model';
import { computeTotals } from '../../utils/document-totals';
import { allVehicles, hasVehicleData, vehicleLabel, vehicleSlot } from '../../utils/document-vehicles';
import { templateById } from '../../utils/document-templates';
import { sectionTitlesOf } from '../../utils/document-sections';
import { lastPaymentDate, sortedPayments } from '../../utils/document-payments';

interface LineGroup {
  title: string | null;
  lines: DocumentLine[];
  subtotal: number;
}

/** Las líneas de trabajo (mano de obra, servicios) y las de piezas (repuestos, productos) se separan en el papel. */
const WORK_KINDS = new Set(['mano_de_obra', 'servicio', 'otro']);

/**
 * La hoja de una cotización o factura: lo que ve el cliente, listo para imprimir o guardar como PDF.
 *
 * Es solo presentación: recibe el documento (tal como se está editando o ya guardado) y calcula los
 * totales con `computeTotals`, la misma regla que usa Postgres al guardar. Imprime con
 * `window.print()`; el CSS global de impresión (`styles.scss`, `.doc-sheet`) deja en la página solo esta hoja.
 *
 * El logo es blanco con la cajita amarilla: va sobre una franja negra, que no depende del papel.
 */
@Component({
  selector: 'app-document-sheet',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './document-sheet.html',
  styleUrl: './document-sheet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentSheet {
  readonly doc = input.required<DocumentDraft>();
  /** `COT-0007`; vacío mientras es un borrador sin guardar. */
  readonly code = input('');
  readonly profile = input.required<BusinessProfile>();
  readonly banks = input<readonly BankAccount[]>([]);

  readonly kindLabel = computed(() => KIND_LABELS[this.doc().kind]);
  readonly statusLabel = computed(() => STATUS_LABELS[this.doc().status]);
  readonly template = computed(() => templateById(this.doc().template));
  readonly lineKindLabels = LINE_KIND_LABELS;
  readonly verdictLabels = VERDICT_LABELS;
  readonly paymentMethodLabels = PAYMENT_METHOD_LABELS;

  /** Los pagos recibidos, del más viejo al más nuevo (solo una factura los tiene). */
  readonly payments = computed(() => (this.doc().kind === 'factura' ? sortedPayments(this.doc().payments) : []));

  /** El día en que se terminó de pagar, si el saldo es cero. */
  readonly paidOn = computed(() => (this.payments().length > 0 && this.totals().balance <= 0 && this.totals().total > 0 ? lastPaymentDate(this.payments()) : null));

  readonly lines = computed(() => this.doc().items.filter((i) => i.description.trim()));

  readonly totals = computed(() => computeTotals({ ...this.doc(), items: this.lines() }));

  /** El vehículo principal y los demás, con el texto que los nombra en el papel. */
  readonly vehicles = computed(() => {
    const d = this.doc();
    return allVehicles(d).map((v, i) => ({ v, label: vehicleLabel(v, i), index: i }));
  });

  /** Más de un vehículo: cada uno se factura aparte, con sus propias líneas y su subtotal. */
  readonly multiVehicle = computed(() => this.template().showVehicle && (this.doc().extraVehicles?.length ?? 0) > 0);

  readonly groups = computed<LineGroup[]>(() => {
    const lines = this.lines();
    const sum = (ls: DocumentLine[]) => ls.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

    if (this.multiVehicle()) {
      const list = this.vehicles();
      const result: LineGroup[] = [];
      const slots: (number | null)[] = [...list.map((x) => x.index), null];
      for (const slot of slots) {
        const own = lines.filter((l) => vehicleSlot(l, list.length) === slot);
        if (own.length === 0) continue;
        const head = slot === null ? 'General' : list[slot].label;
        // Las secciones solo se muestran si el vehículo tiene más de una: con una sola no aportan nada.
        const titles = sectionTitlesOf(own);
        if (titles.length < 2) {
          result.push({ title: head, lines: own, subtotal: sum(own) });
          continue;
        }
        for (const title of titles) {
          const inSection = own.filter((l) => l.section === title);
          result.push({ title: [head, title.trim()].filter(Boolean).join(' · '), lines: inSection, subtotal: sum(inSection) });
        }
      }
      return result;
    }

    // Con secciones elegidas por quien armó el documento, el papel las respeta tal cual.
    if (lines.some((l) => l.section.trim())) {
      return sectionTitlesOf(lines).map((title) => {
        const own = lines.filter((l) => l.section === title);
        return { title: title.trim() || null, lines: own, subtotal: sum(own) };
      });
    }

    // Documentos de antes de las secciones: se separan trabajo y piezas.
    const work = lines.filter((l) => WORK_KINDS.has(l.kind));
    const parts = lines.filter((l) => !WORK_KINDS.has(l.kind));

    if (work.length > 0 && parts.length > 0) {
      return [
        { title: 'Mano de obra y servicios', lines: work, subtotal: sum(work) },
        { title: 'Repuestos y productos', lines: parts, subtotal: sum(parts) },
      ];
    }
    return [{ title: null, lines, subtotal: sum(lines) }];
  });

  readonly hasVehicle = computed(() => this.template().showVehicle && allVehicles(this.doc()).some(hasVehicleData));

  /** Las cuentas de ejemplo que deja la migración no se imprimen para un cliente. */
  readonly realBanks = computed(() => this.banks().filter((b) => !b.isExample));

  /** Solo una factura con saldo muestra cómo pagar. */
  readonly showPayment = computed(() => this.doc().kind === 'factura' && this.totals().balance > 0);

  readonly discountLabel = computed(() => {
    const d = this.doc();
    return d.discountType === 'percent' ? `Descuento (${d.discountValue} %)` : 'Descuento';
  });
}
