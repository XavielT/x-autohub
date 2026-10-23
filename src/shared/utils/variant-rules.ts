import { VariantDraft } from '../models/admin-inventory.model';

/** El largo máximo del nombre de una opción (el check de `product_variants.name`). */
export const VARIANT_NAME_MAX = 40;
/** El largo máximo de la etiqueta ("Color", "Talla"): el check de `hub_parts.variant_label`. */
export const VARIANT_LABEL_MAX = 30;

/**
 * Las reglas de una lista de opciones, las mismas que exige la base (migración 0023), para
 * avisar antes de ir a la red. Devuelve el primer problema en español, o `null` si está bien.
 *
 *   · El nombre va sin espacios a los lados, de 1 a 40 caracteres.
 *   · No se repite en el producto (sin importar mayúsculas): confundiría a quien elige.
 *   · El stock es un entero de 0 o más.
 *   · El SKU, si se escribe, no se repite dentro de la lista.
 */
export function validateVariantDrafts(drafts: readonly VariantDraft[]): string | null {
  const names = new Set<string>();
  const skus = new Set<string>();

  for (const [i, v] of drafts.entries()) {
    const name = v.name.trim();
    const where = name ? `La opción "${name}"` : `La opción ${i + 1}`;

    if (!name) return `${where} necesita un nombre.`;
    if (name.length > VARIANT_NAME_MAX) return `${where} es muy larga (máximo ${VARIANT_NAME_MAX} caracteres).`;
    if (names.has(name.toLowerCase())) return `Hay dos opciones llamadas "${name}".`;
    names.add(name.toLowerCase());

    if (!Number.isInteger(v.stock) || v.stock < 0) return `${where} tiene unas existencias que no son válidas.`;

    const sku = v.sku.trim().toLowerCase();
    if (sku) {
      if (skus.has(sku)) return `Hay dos opciones con el SKU "${v.sku.trim()}".`;
      skus.add(sku);
    }
  }

  return null;
}

/** La suma del stock de las opciones activas: lo que el trigger deja en el producto. */
export function activeVariantStock(drafts: readonly VariantDraft[]): number {
  return drafts.filter((v) => v.isActive).reduce((sum, v) => sum + (Number.isFinite(v.stock) ? v.stock : 0), 0);
}
