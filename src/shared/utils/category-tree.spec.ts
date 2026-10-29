import { ProductCategoryModel } from '../models/product.model';
import { buildCategoryTree } from './category-tree';
import { slugify } from './slugify';

const cat = (id: number, parentId: number | null, name: string, sortOrder: number, isActive = true): ProductCategoryModel => ({
  id,
  parentId,
  slug: slugify(name),
  name,
  icon: null,
  sortOrder,
  isActive,
});

describe('buildCategoryTree', () => {
  it('cuelga cada hija de su categoría, todo en orden', () => {
    const tree = buildCategoryTree([
      cat(3, 1, 'Pastillas', 20),
      cat(2, 1, 'Discos', 10),
      cat(1, null, 'Frenos', 60),
      cat(4, null, 'Audio', 40),
    ]);

    expect(tree.map((n) => n.name)).toEqual(['Audio', 'Frenos']);
    expect(tree[1].children.map((c) => c.name)).toEqual(['Discos', 'Pastillas']);
    expect(tree[0].children).toEqual([]);
  });

  it('con el mismo orden desempata por nombre, en español', () => {
    const tree = buildCategoryTree([cat(1, null, 'Zapatas', 10), cat(2, null, 'Álbum', 10), cat(3, null, 'Baterías', 10)]);
    expect(tree.map((n) => n.name)).toEqual(['Álbum', 'Baterías', 'Zapatas']);
  });

  it('una hija cuyo padre no está en la lista se descarta: no aparece suelta en la raiz', () => {
    const tree = buildCategoryTree([cat(2, 99, 'Huerfana', 10), cat(1, null, 'Frenos', 10)]);
    expect(tree.map((n) => n.name)).toEqual(['Frenos']);
    expect(tree[0].children).toEqual([]);
  });

  it('una lista vacia da un arbol vacío', () => {
    expect(buildCategoryTree([])).toEqual([]);
  });

  it('no modifica la lista que recibe', () => {
    const original = [cat(2, null, 'B', 20), cat(1, null, 'A', 10)];
    buildCategoryTree(original);
    expect(original.map((c) => c.name)).toEqual(['B', 'A']);
  });
});

describe('slugify', () => {
  it('quita acentos, pasa a minúsculas y separa con guiones', () => {
    expect(slugify('Disco ventilado GTR 355mm')).toBe('disco-ventilado-gtr-355mm');
    expect(slugify('Mercedes-Benz')).toBe('mercedes-benz');
    expect(slugify('Citroën')).toBe('citroen');
    expect(slugify('Batería AGM 70Ah')).toBe('bateria-agm-70ah');
    expect(slugify('Niño')).toBe('nino');
  });

  it('cualquier simbolo separa palabras, como en la base', () => {
    expect(slugify("Meguiar's")).toBe('meguiar-s');
    expect(slugify('K&N')).toBe('k-n');
    expect(slugify('CR-V')).toBe('cr-v');
  });

  it('no deja guiones ni al principio ni al final, ni repetidos', () => {
    expect(slugify('  --Hola   mundo--  ')).toBe('hola-mundo');
    expect(slugify('!!!')).toBe('');
  });
});
