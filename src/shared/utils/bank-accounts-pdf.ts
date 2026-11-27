import { BankAccount } from '../models/order.model';
import { PDF_PAGE, PdfColor, PdfDoc, PdfImage, approxTextWidth, wrapText } from './simple-pdf';
import { STORE_PHONE_DISPLAY } from './contact';

const AMBER: PdfColor = [1, 0.702, 0];
const BLACK: PdfColor = [0.07, 0.07, 0.07];
const WHITE: PdfColor = [1, 1, 1];
const GRAY: PdfColor = [0.4, 0.4, 0.4];
const BORDER: PdfColor = [0.82, 0.82, 0.82];

const MARGIN = 48;
const BOX_HEIGHT = 96;
const BOX_GAP = 14;
const HEADER = 112;
const BOTTOM = PDF_PAGE.height - 90;

/** El fondo oscuro del encabezado, en hex, para aplanar el logo (el JPEG no tiene transparencia). */
const HEADER_HEX = '#121212';

const NOTES = [
  'Después de pagar, sube tu comprobante en la página de tu pedido o envíalo por WhatsApp con tu número de pedido.',
  'Verifica el nombre del titular antes de transferir. X AutoHub nunca te pedirá pagos a otras cuentas.',
];

/** Lo que el PDF dice de quien cobra: viene de `business_profile` (se edita en el panel). El RNC sale solo si hay uno. */
export interface PdfBusiness {
  legalName?: string;
  rnc?: string;
}

export interface BankPdfOptions {
  date?: Date;
  business?: PdfBusiness;
  /** El logo ya convertido a JPEG (ver `loadLogoJpeg`). Sin él, el encabezado lleva el nombre en letras. */
  logo?: PdfImage | null;
}

/**
 * El PDF "Cuentas para pagar": las cuentas bancarias de X AutoHub para depósitos y transferencias.
 * Una hoja A4 con encabezado de marca (logo, razón social y RNC si lo hay), una caja por cuenta (banco,
 * titular, tipo y número) y las indicaciones para enviar el comprobante. Pasa de página solo si hay muchas cuentas.
 */
export function buildBankAccountsPdf(accounts: readonly BankAccount[], options: BankPdfOptions = {}): Uint8Array {
  const doc = new PdfDoc('Cuentas para pagar - X AutoHub');
  const when = (options.date ?? new Date()).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
  const legalName = options.business?.legalName?.trim() || 'X AutoHub';
  const rnc = options.business?.rnc?.trim() ?? '';
  const logo = options.logo ? doc.addImage(options.logo.bytes, options.logo.width, options.logo.height) : null;

  const header = (page: ReturnType<PdfDoc['addPage']>, first: boolean) => {
    const height = first ? HEADER : 60;
    page.rect(0, 0, PDF_PAGE.width, height, { fill: BLACK });
    page.rect(0, height, PDF_PAGE.width, 5, { fill: AMBER });
    const logoH = first ? 44 : 30;
    if (logo) {
      page.image(logo, MARGIN, first ? 24 : 15, logoH * (logo.width / logo.height), logoH);
    } else {
      page.text('X AutoHub', MARGIN, first ? 54 : 38, first ? 28 : 18, 'bold', AMBER);
    }
    if (first) {
      page.text('Cuentas para pagar', MARGIN, 94, 15, 'bold', WHITE);
      const right = (text: string, y: number, size: number, font: 'regular' | 'bold') =>
        page.text(text, PDF_PAGE.width - MARGIN - approxTextWidth(text, size, font), y, size, font, WHITE);
      right(legalName, 42, 12, 'bold');
      if (rnc) right(`RNC ${rnc}`, 58, 10, 'regular');
      right(`Actualizado el ${when}`, 94, 9, 'regular');
    }
  };

  const footer = (page: ReturnType<PdfDoc['addPage']>) => {
    page.line(MARGIN, PDF_PAGE.height - 56, PDF_PAGE.width - MARGIN, PDF_PAGE.height - 56, BORDER);
    page.text(`xautohubrd.com  ·  WhatsApp ${STORE_PHONE_DISPLAY}`, MARGIN, PDF_PAGE.height - 38, 10, 'regular', GRAY);
  };

  let page = doc.addPage();
  header(page, true);
  let y = HEADER + 44;

  if (accounts.length === 0) {
    page.text('Todavía no hay cuentas publicadas.', MARGIN, y + 10, 12, 'regular', BLACK);
    page.text(`Escríbenos por WhatsApp al ${STORE_PHONE_DISPLAY} y te enviamos los datos.`, MARGIN, y + 30, 12, 'regular', BLACK);
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
    page.text(acc.bank, MARGIN + 20, y + 26, 16, 'bold', BLACK);
    page.text([acc.holder, acc.type].filter(Boolean).join('  ·  '), MARGIN + 20, y + 46, 11, 'regular', GRAY);
    page.text('Número de cuenta', MARGIN + 20, y + 66, 9, 'regular', GRAY);
    page.text(acc.number, MARGIN + 20, y + 85, 18, 'mono', BLACK);
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
  page.text('Cómo pagar', MARGIN, y, 13, 'bold', BLACK);
  y += 20;
  for (const note of NOTES) {
    const lines = wrapText(note, 11, PDF_PAGE.width - MARGIN * 2 - 14);
    lines.forEach((line, i) => {
      if (i === 0) page.text('·', MARGIN, y, 11, 'bold', BLACK);
      page.text(line, MARGIN + 14, y, 11, 'regular', BLACK);
      y += 15;
    });
    y += 4;
  }
  footer(page);

  return doc.build();
}

/**
 * El logo del sitio como JPEG para incrustarlo en un PDF: se dibuja sobre el fondo oscuro del encabezado en un canvas.
 * Devuelve `null` si algo falla (sin canvas, sin red): el PDF sale igual, con el nombre en letras.
 */
export async function loadLogoJpeg(src = 'assets/imgs/autohub-logo.png'): Promise<PdfImage | null> {
  try {
    const blob = await (await fetch(src)).blob();
    const bitmap = await createImageBitmap(blob);
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = HEADER_HEX;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!jpeg) return null;
    return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

/** Arma el PDF de cuentas (con el logo, si carga) y lo descarga. Lo usan /cuentas, /pedido/:id y Ajustes. */
export async function downloadBankAccountsPdf(accounts: readonly BankAccount[], business?: PdfBusiness): Promise<void> {
  const logo = await loadLogoJpeg();
  downloadFile(buildBankAccountsPdf(accounts, { business, logo }), 'cuentas-x-autohub.pdf');
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
