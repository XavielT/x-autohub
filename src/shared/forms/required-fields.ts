/**
 * Realimentación de campos obligatorios, compartida por todos los formularios.
 *
 * El problema que resuelve: hasta ahora un envío incompleto solo decía "completa
 * los campos obligatorios", sin decir cuál faltaba ni marcarlo. Y los campos
 * obligatorios tampoco se veían como tales antes de intentar enviar.
 *
 * La pieza central es una sola lista de `RequiredField`: el componente declara
 * qué campos son obligatorios, con qué etiqueta los ve el usuario y si ahora
 * mismo faltan. De esa lista salen las tres cosas — el mensaje que los nombra,
 * a cuál llevar el foco y en qué orden — así que no hay forma de que el aviso
 * mencione un campo distinto del que se marca en rojo.
 *
 * Son funciones puras (salvo `focusFirstInvalid`, que toca el DOM a propósito) y
 * no dependen del estilo de formulario: sirven igual para uno reactivo, como
 * `publicar`, que para uno de señales con `ngModel`, como `checkout`. Por eso el
 * enlace con el DOM es por selector y no por `AbstractControl`.
 */

export interface RequiredField {
  /**
   * Con qué encontrar el control en el DOM. Se prueba contra
   * `formControlName`, `name`, `data-field` e `id`, en ese orden, así que basta
   * con que coincida con el nombre que el control ya tiene en la plantilla.
   */
  key: string;
  /** Etiqueta en español, exactamente como la lee el usuario en la pantalla. */
  label: string;
  /** true cuando el campo falta o no es válido. */
  invalid: boolean;
}

/** Etiquetas de lo que falta, en el orden en que aparece en el formulario. */
export function missingFieldLabels(fields: readonly RequiredField[]): string[] {
  return fields.filter((field) => field.invalid).map((field) => field.label);
}

/**
 * Aviso que nombra lo que falta: `Te falta completar: Titulo, Precio.`
 *
 * Devuelve cadena vacía si no falta nada, para que el llamador pueda usarla como
 * condición sin repetir el filtro.
 */
export function missingFieldsMessage(fields: readonly RequiredField[]): string {
  const labels = missingFieldLabels(fields);
  return labels.length === 0 ? '' : `Te falta completar: ${labels.join(', ')}.`;
}

/**
 * Lleva el foco al primer campo que falta y lo centra en pantalla.
 *
 * Recorre la lista en orden, no el DOM, para que el primero sea el primero del
 * formulario y no el primero que el navegador encuentre.
 *
 * @returns true si encontró algo a lo que enfocar. false significa que no falta
 *   nada, o que el `key` no coincide con ningún control — útil para detectar en
 *   una prueba que la lista y la plantilla se desincronizaron.
 */
export function focusFirstInvalid(host: HTMLElement, fields: readonly RequiredField[]): boolean {
  const target = fields.find((field) => field.invalid);
  if (!target) return false;

  const element = host.querySelector<HTMLElement>(
    `[formcontrolname="${target.key}"], [name="${target.key}"], ` +
      `[data-field="${target.key}"], #${target.key}`,
  );
  if (!element) return false;

  // El scroll se hace aparte: enfocar ya desplaza, pero deja el campo pegado al
  // borde. `preventScroll` + `center` lo deja a la vista con contexto alrededor.
  element.focus({ preventScroll: true });

  // jsdom no implementa scrollIntoView, y en el navegador siempre existe.
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'center' });
  }

  return true;
}
