import { buildBankAccountsPdf } from './bank-accounts-pdf';
import { BankAccount } from '../models/order.model';
import { PdfDoc, wrapText } from './simple-pdf';

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const cuenta = (n: number): BankAccount => ({ bank: `Banco ${n}`, holder: 'Xaviel Terrero', number: `000-${n}`, type: 'Ahorro', isExample: false });

describe('PDF de cuentas', () => {
  it('es un PDF válido con las cuentas, con tildes y con su tabla xref bien apuntada', () => {
    const pdf = text(buildBankAccountsPdf([cuenta(1), { ...cuenta(2), holder: 'José Muñoz' }], new Date(2026, 10, 27)));

    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('(Banco 1)');
    expect(pdf).toContain('000-2');
    expect(pdf).toContain('Jos\xe9 Mu\xf1oz');
    expect(pdf).toContain('/Count 1');

    // Cada entrada de la tabla xref debe caer justo en "N 0 obj".
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    const rows = pdf.slice(xref).split('\n').slice(3).filter((l) => /^\d{10} 00000 n/.test(l));
    rows.forEach((row, i) => expect(pdf.slice(Number(row.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it('con muchas cuentas pasa a una segunda hoja, y sin ninguna avisa en vez de quedar vacío', () => {
    const muchas = text(buildBankAccountsPdf(Array.from({ length: 12 }, (_, i) => cuenta(i + 1))));
    expect(muchas).toMatch(/\/Count [2-9]/);

    const ninguna = text(buildBankAccountsPdf([]));
    expect(ninguna).toContain('Todav\xeda no hay cuentas publicadas');
  });
});

describe('simple-pdf', () => {
  it('escapa paréntesis y barras, y cambia lo que Latin-1 no tiene', () => {
    const page = new PdfDoc('t');
    const p = page.addPage();
    p.text('a (b) \\ “c” …', 10, 10, 12);
    const out = text(page.build());
    expect(out).toContain('(a \\(b\\) \\\\ "c" ...)');
  });

  it('wrapText parte un párrafo en líneas del ancho dado', () => {
    const lines = wrapText('uno dos tres cuatro cinco seis siete ocho', 10, 60);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('uno dos tres cuatro cinco seis siete ocho');
  });
});
