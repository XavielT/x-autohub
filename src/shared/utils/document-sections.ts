import { DocumentLine } from '../models/business-document.model';

/**
 * Las secciones de un documento: títulos que elige quien lo arma ("Aire acondicionado", "Chequeo",
 * "Repuestos"…). Una sección no es un objeto aparte: es el texto `section` de cada línea. La lista de
 * títulos (que fija el orden y deja tener secciones todavía vacías) vive solo en el editor.
 *
 * Todo aquí es puro y no muta lo que recibe.
 */

/** Títulos que se ofrecen con un toque al crear una sección. */
export const SECTION_PRESETS: readonly string[] = [
  'Aire acondicionado',
  'Mecánica',
  'Eléctrica',
  'Chequeo / Diagnóstico',
  'Mano de obra',
  'Repuestos',
  'Productos',
  'Instalación',
  'Mantenimiento',
];

/** Los títulos distintos, en el orden en que aparecen por primera vez. */
export function sectionTitlesOf(items: readonly { section: string }[]): string[] {
  const titles: string[] = [];
  for (const item of items) if (!titles.includes(item.section)) titles.push(item.section);
  return titles;
}

/** Une los títulos pedidos con los que ya traen las líneas (sin repetir): ninguna línea queda sin su sección. */
export function mergeTitles(titles: readonly string[], items: readonly { section: string }[]): string[] {
  const merged = [...new Set(titles)];
  for (const t of sectionTitlesOf(items)) if (!merged.includes(t)) merged.push(t);
  return merged;
}

/** Ordena las líneas según el orden de las secciones, sin alterar el orden dentro de cada una. */
export function sortBySection<T extends { section: string }>(items: readonly T[], titles: readonly string[]): T[] {
  const rank = (t: string) => {
    const i = titles.indexOf(t);
    return i === -1 ? titles.length : i;
  };
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.section) - rank(b.item.section) || a.index - b.index)
    .map((x) => x.item);
}

/** Agrupa por sección en el orden de `titles`; las secciones vacías salen con `lines: []`. */
export function groupBySection<T extends { section: string }>(
  items: readonly T[],
  titles: readonly string[],
): { title: string; lines: T[] }[] {
  return mergeTitles(titles, items).map((title) => ({ title, lines: items.filter((i) => i.section === title) }));
}

/** Cambia el nombre de una sección. Si el nombre nuevo ya existe, las dos se funden en una. */
export function renameSection(
  items: readonly DocumentLine[],
  titles: readonly string[],
  from: string,
  to: string,
): { items: DocumentLine[]; titles: string[] } {
  const next = to.trim();
  return {
    items: items.map((i) => (i.section === from ? { ...i, section: next } : i)),
    titles: [...new Set(titles.map((t) => (t === from ? next : t)))],
  };
}

/** Mueve un elemento una posición (`-1` arriba, `1` abajo). Fuera de rango devuelve lo mismo. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/** Mueve una línea una posición dentro de su propia sección (no salta a otra). */
export function moveLine(items: readonly DocumentLine[], uid: string, delta: -1 | 1): DocumentLine[] {
  const at = items.findIndex((i) => i.uid === uid);
  if (at === -1) return [...items];
  const section = items[at].section;
  const step = delta;
  for (let j = at + step; j >= 0 && j < items.length; j += step) {
    if (items[j].section === section) {
      const copy = [...items];
      [copy[at], copy[j]] = [copy[j], copy[at]];
      return copy;
    }
  }
  return [...items];
}

/** Un título que no choque con los existentes: "Nueva sección", "Nueva sección 2"… */
export function uniqueTitle(base: string, titles: readonly string[]): string {
  if (!titles.includes(base)) return base;
  let n = 2;
  while (titles.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
