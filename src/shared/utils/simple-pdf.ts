/**
 * Un escritor de PDF mínimo, sin dependencias: texto en Helvetica o Courier (con tildes y ñ), rectángulos y líneas.
 * Alcanza para documentos de una o pocas páginas como "Cuentas para pagar"; no es una librería de uso general
 * (sin imágenes, sin fuentes propias). Todo el contenido es Latin-1, así que un carácter es un byte.
 */

export type PdfFont = 'regular' | 'bold' | 'mono';
export type PdfColor = readonly [number, number, number];

export const PDF_PAGE = { width: 595.28, height: 841.89 } as const; // A4 en puntos

const FONT_NAME: Record<PdfFont, string> = { regular: 'F1', bold: 'F2', mono: 'F3' };
const FONT_BASE: Record<PdfFont, string> = { regular: 'Helvetica', bold: 'Helvetica-Bold', mono: 'Courier-Bold' };

/** Lo que el PDF no puede dibujar con su codificación se reemplaza por algo parecido. */
function toLatin1(text: string): string {
  const swaps: Record<string, string> = { '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '…': '...', '•': '·', '→': '->' };
  return [...text].map((ch) => swaps[ch] ?? (ch.charCodeAt(0) < 256 ? ch : '?')).join('');
}

function escapeText(text: string): string {
  return toLatin1(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\r\n]+/g, ' ');
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const rgb = (c: PdfColor) => `${num(c[0])} ${num(c[1])} ${num(c[2])}`;

/** Ancho aproximado del texto, para partir párrafos en líneas (Helvetica ronda 0.5 em por carácter). */
export function approxTextWidth(text: string, size: number, font: PdfFont = 'regular'): number {
  const em = font === 'mono' ? 0.6 : font === 'bold' ? 0.56 : 0.5;
  return text.length * size * em;
}

/** Parte un párrafo en líneas que quepan en `maxWidth`. */
export function wrapText(text: string, size: number, maxWidth: number, font: PdfFont = 'regular'): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && approxTextWidth(next, size, font) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export class PdfPage {
  readonly ops: string[] = [];

  /** `y` se mide desde ARRIBA de la hoja (como en una página web), no desde abajo como en el PDF. */
  text(text: string, x: number, y: number, size: number, font: PdfFont = 'regular', color: PdfColor = [0, 0, 0]): this {
    this.ops.push(`BT /${FONT_NAME[font]} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(PDF_PAGE.height - y)} Td (${escapeText(text)}) Tj ET`);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, opts: { fill?: PdfColor; stroke?: PdfColor; lineWidth?: number } = {}): this {
    const parts: string[] = [];
    if (opts.fill) parts.push(`${rgb(opts.fill)} rg`);
    if (opts.stroke) parts.push(`${rgb(opts.stroke)} RG ${num(opts.lineWidth ?? 1)} w`);
    parts.push(`${num(x)} ${num(PDF_PAGE.height - y - h)} ${num(w)} ${num(h)} re ${opts.fill && opts.stroke ? 'B' : opts.fill ? 'f' : 'S'}`);
    this.ops.push(parts.join(' '));
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, color: PdfColor = [0, 0, 0], width = 1): this {
    this.ops.push(`${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(PDF_PAGE.height - y1)} m ${num(x2)} ${num(PDF_PAGE.height - y2)} l S`);
    return this;
  }
}

export class PdfDoc {
  private readonly pages: PdfPage[] = [];

  constructor(private readonly title = '') {}

  addPage(): PdfPage {
    const page = new PdfPage();
    this.pages.push(page);
    return page;
  }

  /** Arma el archivo. Los objetos van en orden y la tabla `xref` apunta a los bytes exactos de cada uno. */
  build(): Uint8Array {
    const objects: string[] = [];
    const add = (body: string) => objects.push(body) && objects.length;

    const fontIds = (Object.keys(FONT_NAME) as PdfFont[]).map((f) =>
      add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_BASE[f]} /Encoding /WinAnsiEncoding >>`),
    );
    const resources = `<< /Font << ${(Object.keys(FONT_NAME) as PdfFont[]).map((f, i) => `/${FONT_NAME[f]} ${fontIds[i]} 0 R`).join(' ')} >> >>`;

    // Los ids de las páginas se conocen de antemano: contenido y página se agregan de a pares.
    const firstPageId = objects.length + 3; // 1..3 fuentes ya puestas; reservamos catálogo y árbol de páginas
    const pageIds: number[] = [];
    const contentBodies: string[] = [];
    this.pages.forEach((p, i) => {
      pageIds.push(firstPageId + i * 2);
      const stream = p.ops.join('\n');
      contentBodies.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });
    const catalogId = objects.length + 1;
    const treeId = objects.length + 2;
    add(`<< /Type /Catalog /Pages ${treeId} 0 R >>`);
    add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>`);
    this.pages.forEach((_, i) => {
      add(`<< /Type /Page /Parent ${treeId} 0 R /MediaBox [0 0 ${num(PDF_PAGE.width)} ${num(PDF_PAGE.height)}] /Resources ${resources} /Contents ${pageIds[i] + 1} 0 R >>`);
      add(contentBodies[i]);
    });
    const infoId = add(`<< /Title (${escapeText(this.title)}) /Producer (X AutoHub) >>`);

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
