/**
 * Texto en minúsculas, sin acentos y con guiones: lo que va en una URL.
 *
 * Es el espejo de `public.xah_slugify()` en Postgres (migración 0017), para que
 * un slug generado aquí —en el mock o en el formulario del admin— sea el mismo
 * que generaría la base. Cualquier carácter que no sea letra o número separa
 * palabras: "Meguiar's" da `meguiar-s` en los dos lados.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
