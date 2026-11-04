import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { DigestService, renderDigest, toDigest } from './digest.service';

describe('DigestService (migración 0056)', () => {
  let service: DigestService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DigestService);
  });

  it('en modo simulado no hay resúmenes, y generar dice que la IA no está', async () => {
    expect(await firstValueFrom(service.getRecent())).toEqual([]);
    expect(await firstValueFrom(service.generateNow())).toBe(false);
  });

  it('toDigest convierte la fila', () => {
    const d = toDigest({ id: 1, digest_date: '2026-11-04', kind: 'lunes', body_md: '- x', ai_generated: false, created_at: '2026-11-04T11:30:00Z' });

    expect(d).toMatchObject({ id: 1, date: '2026-11-04', kind: 'lunes', aiGenerated: false });
    expect(d.createdAt).toEqual(new Date('2026-11-04T11:30:00Z'));
  });

  describe('renderDigest', () => {
    it('las viñetas, las numeradas con enlace a /admin y los títulos en negrita', () => {
      const lines = renderDigest('- Hay **2** pedidos\n\n**Lo primero que haría hoy**\n1. [Confirma los pagos](/admin/pedidos)');

      expect(lines.map((l) => l.kind)).toEqual(['bullet', 'heading', 'numbered']);
      expect(lines[0].parts).toEqual([{ text: 'Hay ' }, { text: '2', bold: true }, { text: ' pedidos' }]);
      expect(lines[2].parts).toEqual([{ text: 'Confirma los pagos', link: '/admin/pedidos' }]);
    });

    it('un enlace que no es de /admin se queda como texto plano (nada de enlaces a otros sitios)', () => {
      const [line] = renderDigest('1. [Mira esto](https://malo.example/robo)');

      expect(line.parts.every((p) => !p.link)).toBe(true);
      expect(line.parts.map((p) => p.text).join('')).toBe('Mira esto');
    });

    it('un enlace con javascript: tampoco se enlaza', () => {
      const [line] = renderDigest('- [x](javascript:alert(1))');

      expect(line.parts.every((p) => !p.link)).toBe(true);
    });

    it('las líneas vacías no salen', () => {
      expect(renderDigest('\n\n  \n- a\n')).toHaveLength(1);
    });
  });
});
