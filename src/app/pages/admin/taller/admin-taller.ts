import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * El taller en el panel: cuatro pestañas — **Citas** (la agenda del día y de la
 * semana), **Servicios** (el catálogo), **Disponibilidad** (horario y cierres) y
 * **Trabajos** (lo que se publica en /servicios).
 *
 * Es solo el marco con la navegación; cada pestaña es su propia ruta hija, cargada a
 * demanda y protegida por `adminGuard`. Todo se puede usar desde el teléfono.
 */
@Component({
  selector: 'app-admin-taller',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="tabs" aria-label="Secciones del taller">
      @for (tab of tabs; track tab.path) {
        <a class="tabs__item" routerLinkActive="is-active" [routerLink]="tab.path">{{ tab.label }}</a>
      }
    </nav>
    <router-outlet />
  `,
  styles: `
    .tabs { display: flex; gap: 8px; margin-bottom: 20px; overflow-x: auto; padding-bottom: 4px; }
    .tabs__item {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 0 20px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 22px;
      color: var(--text-soft);
      font-family: var(--font-brand);
      font-size: 14px;
      text-decoration: none;
    }
    .tabs__item:hover { border-color: var(--Hub); color: var(--Hub); }
    .tabs__item.is-active { background-color: var(--Hub); border-color: var(--Hub); color: #1a1a1a; font-weight: 700; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTaller {
  readonly tabs = [
    { path: 'citas', label: 'Citas' },
    { path: 'servicios', label: 'Servicios' },
    { path: 'disponibilidad', label: 'Disponibilidad' },
    { path: 'trabajos', label: 'Trabajos' },
  ] as const;
}
