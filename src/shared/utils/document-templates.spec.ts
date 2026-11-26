import { DOCUMENT_TEMPLATES, draftFromTemplate, templateById, validateDraft } from './document-templates';

describe('plantillas de documentos', () => {
  it('cada plantilla tiene id único, condiciones y ninguna sugerencia trae precio', () => {
    const ids = DOCUMENT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of DOCUMENT_TEMPLATES) {
      expect(t.terms.length).toBeGreaterThan(10);
      for (const s of t.suggestions) expect(Object.keys(s).sort()).toEqual(['description', 'kind']);
    }
  });

  it('la venta de piezas no lleva vehículo y la mecánica sí', () => {
    expect(templateById('venta').showVehicle).toBe(false);
    expect(templateById('mecanica').showVehicle).toBe(true);
  });

  it('una cotización nueva trae validez, condiciones y una línea con el tipo de la plantilla', () => {
    const d = draftFromTemplate('mecanica', 'cotizacion', '2026-11-26');
    expect(d.validUntil).toBe('2026-12-11');
    expect(d.terms).toContain('30 días');
    expect(d.items).toHaveLength(1);
    expect(d.items[0].kind).toBe('mano_de_obra');
    expect(d.applyItbis).toBe(false);
  });

  it('una factura nueva no lleva fecha de validez', () => {
    expect(draftFromTemplate('venta', 'factura', '2026-11-26').validUntil).toBeNull();
  });

  it('validateDraft pide cliente, una línea y valores coherentes', () => {
    const d = draftFromTemplate('general', 'factura');
    expect(validateDraft(d)).toMatch(/cliente/);
    d.customerName = 'Juan';
    expect(validateDraft(d)).toMatch(/al menos una línea/);
    d.items[0].description = 'Diagnóstico';
    expect(validateDraft(d)).toBeNull();
    d.items[0].quantity = 0;
    expect(validateDraft(d)).toMatch(/cantidad/);
    d.items[0].quantity = 1;
    d.discountType = 'percent';
    d.discountValue = 150;
    expect(validateDraft(d)).toMatch(/0 a 100/);
  });
});
