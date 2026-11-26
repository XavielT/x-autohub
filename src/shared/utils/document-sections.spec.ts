import { DocumentLine } from '../models/business-document.model';
import {
  groupBySection,
  mergeTitles,
  moveItem,
  moveLine,
  renameSection,
  sectionTitlesOf,
  sortBySection,
  uniqueTitle,
} from './document-sections';

const line = (uid: string, section: string): DocumentLine => ({
  uid,
  kind: 'servicio',
  description: uid,
  quantity: 1,
  unitPrice: 10,
  section,
  tbd: false,
});

describe('secciones de un documento', () => {
  const items = [line('a', 'A/C'), line('b', 'Mecánica'), line('c', 'A/C')];

  it('los títulos salen en orden de aparición, sin repetir', () => {
    expect(sectionTitlesOf(items)).toEqual(['A/C', 'Mecánica']);
  });

  it('mergeTitles conserva las secciones vacías y suma las que traen las líneas', () => {
    expect(mergeTitles(['Chequeo', 'A/C'], items)).toEqual(['Chequeo', 'A/C', 'Mecánica']);
  });

  it('sortBySection ordena por el orden de las secciones y respeta el orden dentro de cada una', () => {
    const sorted = sortBySection(items, ['Mecánica', 'A/C']);
    expect(sorted.map((i) => i.uid)).toEqual(['b', 'a', 'c']);
  });

  it('groupBySection devuelve también las secciones vacías', () => {
    const groups = groupBySection(items, ['Chequeo', 'A/C']);
    expect(groups.map((g) => [g.title, g.lines.length])).toEqual([
      ['Chequeo', 0],
      ['A/C', 2],
      ['Mecánica', 1],
    ]);
  });

  it('renombrar cambia las líneas y la lista de títulos', () => {
    const r = renameSection(items, ['A/C', 'Mecánica'], 'A/C', 'Aire acondicionado');
    expect(r.titles).toEqual(['Aire acondicionado', 'Mecánica']);
    expect(r.items.filter((i) => i.section === 'Aire acondicionado')).toHaveLength(2);
  });

  it('renombrar a un título que ya existe funde las dos secciones', () => {
    const r = renameSection(items, ['A/C', 'Mecánica'], 'A/C', 'Mecánica');
    expect(r.titles).toEqual(['Mecánica']);
    expect(r.items.every((i) => i.section === 'Mecánica')).toBe(true);
  });

  it('moveItem sube y baja sin salirse de la lista', () => {
    expect(moveItem(['x', 'y', 'z'], 1, -1)).toEqual(['y', 'x', 'z']);
    expect(moveItem(['x', 'y', 'z'], 0, -1)).toEqual(['x', 'y', 'z']);
    expect(moveItem(['x', 'y', 'z'], 2, 1)).toEqual(['x', 'y', 'z']);
  });

  it('moveLine mueve dentro de su sección y no salta a otra', () => {
    expect(moveLine(items, 'c', -1).map((i) => i.uid)).toEqual(['c', 'b', 'a']);
    expect(moveLine(items, 'b', -1).map((i) => i.uid)).toEqual(['a', 'b', 'c']);
    expect(moveLine(items, 'c', 1).map((i) => i.uid)).toEqual(['a', 'b', 'c']);
  });

  it('uniqueTitle evita repetir un nombre', () => {
    expect(uniqueTitle('Nueva sección', [])).toBe('Nueva sección');
    expect(uniqueTitle('Nueva sección', ['Nueva sección', 'Nueva sección 2'])).toBe('Nueva sección 3');
  });
});
