import { BankAccount } from '../models/order.model';
import { PDF_PAGE, PdfColor, PdfDoc, wrapText } from './simple-pdf';
import { STORE_PHONE_DISPLAY } from './contact';

const AMBER: PdfColor = [1, 0.702, 0];
const DARK: PdfColor = [0.07, 0.07, 0.07];
const GRAY: PdfColor = [0.4, 0.4, 0.4];
const BORDER: PdfColor = [0.82, 0.82, 0.82];

const MARGIN = 48;
const BOX_HEIGHT = 96;
const BOX_GAP = 14;
const FIRST_Y = 150;
const BOTTOM = PDF_PAGE.height - 90;

const NOTES = [
  'Después de pagar, sube tu comprobante en la página de tu pedido o envíalo por WhatsApp con tu número de pedido.',
  'Verifica el nombre del titular antes de transferir. X AutoHub nunca te pedirá pagos a otras cuentas.',
];

/**
 * El PDF "Cuentas para pagar": las cuentas bancarias de X AutoHub para depósitos y transferencias.
 * Una hoja A4 con encabezado de marca, una caja por cuenta (banco, titular, tipo y número) y las
 * indicaciones para enviar el comprobante. Pasa de página solo si hay muchas cuentas.
 */
export function buildBankAccountsPdf(accounts: readonly BankAccount[], date = new Date()): Uint8Array {
  const doc = new PdfDoc('Cuentas para pagar - X AutoHub');
  const when = date.toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });

  const header = (page: ReturnType<PdfDoc['addPage']>, first: boolean) => {
    page.rect(0, 0, PDF_PAGE.width, first ? 110 : 56, { fill: AMBER });
    page.text('X AutoHub', MARGIN, first ? 52 : 36, first ? 30 : 20, 'bold', DARK);
    if (first) {
      page.text('Cuentas para pagar', MARGIN, 82, 16, 'bold', DARK);
      page.text(`Actualizado el ${when}`, MARGIN, 99, 10, 'regular', DARK);
    }
  };

  const footer = (page: ReturnType<PdfDoc['addPage']>) => {
    page.line(MARGIN, PDF_PAGE.height - 56, PDF_PAGE.width - MARGIN, PDF_PAGE.height - 56, BORDER);
    page.text(`xautohubrd.com  ·  WhatsApp ${STORE_PHONE_DISPLAY}`, MARGIN, PDF_PAGE.height - 38, 10, 'regular', GRAY);
  };

  let page = doc.addPage();
  header(page, true);
  let y = FIRST_Y;

  if (accounts.length === 0) {
    page.text('Todavía no hay cuentas publicadas.', MARGIN, y + 10, 12, 'regular', DARK);
    page.text(`Escríbenos por WhatsApp al ${STORE_PHONE_DISPLAY} y te enviamos los datos.`, MARGIN, y + 30, 12, 'regular', DARK);
  }

  for (const acc of accounts) {
    if (y + BOX_HEIGHT > BOTTOM) {
      footer(page);
      page = doc.addPage();
      header(page, false);
      y = 96;
    }
    page.rect(MARGIN, y, PDF_PAGE.width - MARGIN * 2, BOX_HEIGHT, { stroke: BORDER, lineWidth: 1 });
    page.rect(MARGIN, y, 5, BOX_HEIGHT, { fill: AMBER });
    page.text(acc.bank, MARGIN + 20, y + 26, 16, 'bold', DARK);
    page.text([acc.holder, acc.type].filter(Boolean).join('  ·  '), MARGIN + 20, y + 46, 11, 'regular', GRAY);
    page.text('Número de cuenta', MARGIN + 20, y + 66, 9, 'regular', GRAY);
    page.text(acc.number, MARGIN + 20, y + 85, 18, 'mono', DARK);
    y += BOX_HEIGHT + BOX_GAP;
  }

  // Las indicaciones, en la última hoja.
  y += 8;
  if (y + 80 > BOTTOM) {
    footer(page);
    page = doc.addPage();
    header(page, false);
    y = 96;
  }
  page.text('Cómo pagar', MARGIN, y, 13, 'bold', DARK);
  y += 20;
  for (const note of NOTES) {
    const lines = wrapText(note, 11, PDF_PAGE.width - MARGIN * 2 - 14);
    lines.forEach((line, i) => {
      if (i === 0) page.text('·', MARGIN, y, 11, 'bold', DARK);
      page.text(line, MARGIN + 14, y, 11, 'regular', DARK);
      y += 15;
    });
    y += 4;
  }
  footer(page);

  return doc.build();
}

/** Descarga un archivo desde el navegador. */
export function downloadFile(bytes: Uint8Array, filename: string, type = 'application/pdf'): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
