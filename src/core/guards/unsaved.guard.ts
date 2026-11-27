import { CanDeactivateFn } from '@angular/router';

/** Una página con trabajo a medias que no debe perderse sin avisar (un formulario largo, con fotos). */
export interface HasUnsavedWork {
  hasUnsavedWork(): boolean;
}

/** Texto del aviso: con `confirm()` del navegador, que bloquea hasta que la persona decida. */
export const UNSAVED_MESSAGE = 'Tienes cambios sin guardar. ¿Salir de todas formas y perderlos?';

/** Antes de salir de la ruta, si hay trabajo a medias, pide confirmar. Sin trabajo a medias deja pasar sin preguntar. */
export const unsavedGuard: CanDeactivateFn<HasUnsavedWork> = (component) =>
  !component.hasUnsavedWork() || (typeof confirm === 'function' ? confirm(UNSAVED_MESSAGE) : true);
