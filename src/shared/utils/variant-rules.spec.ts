import { VariantDraft } from '../models/admin-inventory.model';
import { activeVariantStock, validateVariantDrafts } from './variant-rules';

const v = (name: string, stock = 1, over: Partial<VariantDraft> = {}): VariantDraft => ({
  id: null, name, sku: '', stock, isActive: true, ...over,
});

describe('variant-rules', () => {
  describe('validateVariantDrafts', () => {
    it('una lista bien formada no tiene problemas, y una vacía tampoco', () => {
      expect(validateVariantDrafts([v('Negro'), v('Gris')])).toBeNull();
      expect(validateVariantDrafts([])).toBeNull();
    });

    it('una opción sin nombre se señala por su posición', () => {
      expect(validateVariantDrafts([v('Negro'), v('   ')])).toBe('La opción 2 necesita un nombre.');
    });

    it('el nombre pasa de 40 caracteres', () => {
      expect(validateVariantDrafts([v('x'.repeat(41))])).toContain('muy larga');
      expect(validateVariantDrafts([v('x'.repeat(40))])).toBeNull();
    });

    it('dos con el mismo nombre se rechazan sin importar mayúsculas ni espacios', () => {
      expect(validateVariantDrafts([v('Negro'), v(' negro ')])).toBe('Hay dos opciones llamadas "negro".');
    });

    it('el stock es un entero de 0 o más', () => {
      expect(validateVariantDrafts([v('Negro', -1)])).toContain('existencias');
      expect(validateVariantDrafts([v('Negro', 1.5)])).toContain('existencias');
      expect(validateVariantDrafts([v('Negro', Number.NaN)])).toContain('existencias');
      expect(validateVariantDrafts([v('Negro', 0)])).toBeNull();
    });

    it('un sku repetido se rechaza; uno vacío puede repetirse', () => {
      expect(validateVariantDrafts([v('A', 1, { sku: 'X1' }), v('B', 1, { sku: 'x1' })])).toContain('SKU');
      expect(validateVariantDrafts([v('A'), v('B')])).toBeNull();
    });
  });

  describe('activeVariantStock', () => {
    it('suma solo las que se ofrecen', () => {
      expect(activeVariantStock([v('A', 3), v('B', 4, { isActive: false }), v('C', 2)])).toBe(5);
    });

    it('una lista vacía suma cero', () => {
      expect(activeVariantStock([])).toBe(0);
    });
  });
});
