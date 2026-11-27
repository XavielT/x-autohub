import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

/**
 * El ojito de una contraseña: va dentro de un contenedor `position: relative` junto al `<input>`
 * y cambia su `type` entre `password` y `text`. Se escribe mal a ciegas, sobre todo en el teléfono.
 * `for` es el id del campo. No guarda nada: al volver a abrir la página la contraseña vuelve a ocultarse.
 */
@Component({
  selector: 'app-password-toggle',
  template: `
    <button type="button" class="pw-toggle" [attr.aria-label]="shown() ? 'Ocultar la contraseña' : 'Mostrar la contraseña'"
            [attr.aria-pressed]="shown()" (click)="toggle()">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        @if (shown()) { <path d="M4 4l16 16" /> }
      </svg>
    </button>
  `,
  styleUrl: './password-toggle.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordToggle {
  /** El id del `<input>` que se muestra u oculta. */
  readonly for = input.required<string>();
  readonly shown = signal(false);

  toggle(): void {
    const field = document.getElementById(this.for()) as HTMLInputElement | null;
    if (!field) return;
    this.shown.update((v) => !v);
    field.type = this.shown() ? 'text' : 'password';
  }
}
