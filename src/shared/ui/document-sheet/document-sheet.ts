import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  BusinessProfile,
  DocumentDraft,
  DocumentLine,
  KIND_LABELS,
  LINE_KIND_LABELS,
  STATUS_LABELS,
} from '../../models/business-document.model';
import { BankAccount } from '../../models/order.model';
import { computeTotals } from '../../utils/document-totals';
import { templateById } from '../../utils/document-templates';

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

  readonly lines = computed(() => this.doc().items.filter((i) => i.description.trim()));

  readonly totals = computed(() => computeTotals({ ...this.doc(), items: this.lines() }));

  readonly groups = computed<LineGroup[]>(() => {
    const lines = this.lines();
    const work = lines.filter((l) => WORK_KINDS.has(l.kind));
    const parts = lines.filter((l) => !WORK_KINDS.has(l.kind));
    const sum = (ls: DocumentLine[]) => ls.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

    if (work.length > 0 && parts.length > 0) {
      return [
        { title: 'Mano de obra y servicios', lines: work, subtotal: sum(work) },
        { title: 'Repuestos y productos', lines: parts, subtotal: sum(parts) },
      ];
    }
    return [{ title: null, lines, subtotal: sum(lines) }];
  });

  readonly hasVehicle = computed(() => {
    const v = this.doc().vehicle;
    return this.template().showVehicle && !!(v.text || v.plate || v.mileage);
  });

  /** Las cuentas de ejemplo que deja la migración no se imprimen para un cliente. */
  readonly realBanks = computed(() => this.banks().filter((b) => !b.isExample));

  /** Solo una factura con saldo muestra cómo pagar. */
  readonly showPayment = computed(() => this.doc().kind === 'factura' && this.totals().balance > 0);

  readonly discountLabel = computed(() => {
    const d = this.doc();
    return d.discountType === 'percent' ? `Descuento (${d.discountValue} %)` : 'Descuento';
  });
}
