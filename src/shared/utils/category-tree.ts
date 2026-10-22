import { ProductCategoryModel, ProductCategoryNode } from '../models/product.model';

/**
 * Arma el árbol de categorías: cada categoría de primer nivel con sus hijas
 * colgadas, todo en `sortOrder` y luego por nombre.
 *
 * Son dos niveles como máximo (lo garantiza un trigger en la base). Una hija
 * cuyo padre no esté en la lista —inactivo, o simplemente no cargado— se descarta
 * en vez de aparecer huérfana en la raíz: un menú con una categoría suelta que
 * pertenece a otra es peor que una que falta.
 */
export function buildCategoryTree(categories: readonly ProductCategoryModel[]): ProductCategoryNode[] {
  const byOrder = (a: ProductCategoryModel, b: ProductCategoryModel) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es');

  return categories
    .filter((c) => c.parentId === null)
    .sort(byOrder)
    .map((root) => ({
      ...root,
      children: categories.filter((c) => c.parentId === root.id).sort(byOrder),
    }));
}
