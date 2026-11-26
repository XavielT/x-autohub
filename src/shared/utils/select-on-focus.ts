/**
 * Al tocar un campo numérico se selecciona todo su contenido: lo que se escribe reemplaza el valor (el 0 de un precio
 * o una cantidad) en vez de quedar pegado a él. Se engancha una sola vez, al `focusin` del documento.
 */
export function selectNumberOnFocus(event: Event): void {
  const el = event.target as HTMLInputElement | null;
  if (el?.tagName === 'INPUT' && el.type === 'number' && !el.readOnly && !el.disabled) el.select?.();
}
