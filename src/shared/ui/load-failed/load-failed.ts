import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * "No pudimos cargar": el estado de una ficha cuando la **consulta falló** (red caída, servidor), que no es lo mismo que
 * "no existe". Decir "no encontramos este vehículo" por un fallo de red le hace creer a quien guardó el enlace que lo
 * quitaron. Ofrece reintentar y un camino de vuelta.
 */
@Component({
  selector: 'app-load-failed',
  imports: [RouterLink],
  template: `
    <div class="lf" role="alert">
      <h2 class="lf__title">{{ title() }}</h2>
      <p class="lf__text">Revisa tu conexión e inténtalo otra vez.</p>
      <div class="lf__actions">
        <button type="button" class="lf__btn" (click)="retry.emit()">Reintentar</button>
        @if (backLink()) {
          <a class="lf__link" [routerLink]="backLink()">{{ backLabel() }}</a>
        }
      </div>
    </div>
  `,
  styles: `
    .lf { max-width: 520px; margin: 48px auto; padding: 0 20px; text-align: center; font-family: var(--font-body); color: var(--text-strong); }
    .lf__title { margin: 0 0 8px; font-size: 22px; }
    .lf__text { margin: 0 0 20px; color: var(--text-soft); }
    .lf__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
    .lf__btn {
      min-height: 48px; padding: 0 24px; border: 0; border-radius: 12px;
      background-color: var(--Hub); color: #1a1a1a; font-family: var(--font-body); font-size: 16px; font-weight: 700; cursor: pointer;
    }
    .lf__link { display: inline-flex; align-items: center; min-height: 48px; color: var(--Hub); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadFailed {
  readonly title = input('No pudimos cargar esta página');
  readonly backLink = input('');
  readonly backLabel = input('Volver');
  readonly retry = output<void>();
}
