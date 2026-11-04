import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminCargarIa } from './admin-cargar-ia';

describe('AdminCargarIa', () => {
  let fixture: ComponentFixture<AdminCargarIa>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AdminCargarIa] }).compileComponents();
    fixture = TestBed.createComponent(AdminCargarIa);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('se crea', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('en modo simulado avisa que necesita la base real y no ofrece subir fotos', () => {
    expect(host.textContent).toContain('modo de prueba');
    expect(host.querySelector('input[type="file"]')).toBeNull();
  });

  it('un borrador dudoso (duplicado, confianza baja) va antes que uno limpio', () => {
    const c = fixture.componentInstance;
    const base = { status: 'ready' as const, sourceKind: 'article' as const, sourcePaths: [], batchId: null, hint: null, unmatched: [], duplicateConfirmed: false, error: null, costUsd: 0, createdAt: new Date() };
    const clean = { ...base, id: 'a', duplicateOf: null, fields: { name: { value: 'x', confidence: 'alta' as const, source: 'sugerido' }, price: { value: 10, confidence: 'alta' as const, source: 'leído en la factura' } } };
    const doubtful = { ...base, id: 'b', duplicateOf: 7, fields: { name: { value: 'y', confidence: 'baja' as const, source: 'deducido de la foto' }, price: { value: null, confidence: 'baja' as const, source: 'falta' } } };
    const failed = { ...base, id: 'c', status: 'failed' as const, duplicateOf: null, fields: {} };

    c.drafts.set([clean, doubtful, failed]);

    // El más dudoso primero (duplicado + confianza baja + precio que falta), luego el que falló, y el limpio al final.
    expect(c.ordered().map((d) => d.id)).toEqual(['b', 'c', 'a']);
  });

  it('para publicar hacen falta nombre, marca, categoría, precio y una foto', () => {
    const c = fixture.componentInstance;
    const draft = { id: 'a', status: 'ready' as const, sourceKind: 'article' as const, sourcePaths: ['x'], batchId: null, hint: null, fields: {}, unmatched: [], duplicateOf: null, duplicateConfirmed: false, error: null, costUsd: 0, createdAt: new Date() };
    const edit = { name: 'Pastillas', brand: 'Toyota', categoryId: 11, partNumber: '', crossRefs: [], shortDescription: '', description: '', price: '1500', stock: '5', specsText: '', fitmentType: 'universal' as const, fitments: [], aliasesText: '', photoIndices: [0], duplicateConfirmed: false, hint: '' };

    c.edits.set({ a: edit });
    expect(c.canPublish(draft)).toBe(true);

    c.edits.set({ a: { ...edit, price: '' } });
    expect(c.canPublish(draft)).toBe(false);
    c.edits.set({ a: { ...edit, categoryId: null } });
    expect(c.canPublish(draft)).toBe(false);
    c.edits.set({ a: { ...edit, photoIndices: [] } });
    expect(c.canPublish(draft)).toBe(false);
  });

  it('un posible duplicado no se aprueba hasta confirmar que es otro artículo', () => {
    const c = fixture.componentInstance;
    const draft = { id: 'a', status: 'ready' as const, sourceKind: 'article' as const, sourcePaths: [], batchId: null, hint: null, fields: {}, unmatched: [], duplicateOf: 9, duplicateConfirmed: false, error: null, costUsd: 0, createdAt: new Date() };
    const edit = { name: 'Pastillas', brand: 'Toyota', categoryId: 11, partNumber: '', crossRefs: [], shortDescription: '', description: '', price: '1500', stock: '5', specsText: '', fitmentType: 'universal' as const, fitments: [], aliasesText: '', photoIndices: [], duplicateConfirmed: false, hint: '' };

    c.edits.set({ a: edit });
    expect(c.canApprove(draft)).toBe(false);
    c.edits.set({ a: { ...edit, duplicateConfirmed: true } });
    expect(c.canApprove(draft)).toBe(true);
  });
});
