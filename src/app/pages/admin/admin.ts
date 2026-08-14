import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';

interface AdminSection {
  path: string;
  label: string;
  description: string;
}

/**
 * Contenedor del panel de administración.
 *
 * Solo dibuja la navegación entre submódulos; cada uno se carga por su propia
 * ruta hija con `loadComponent`, así que entrar al panel no descarga el código
 * de las cuatro secciones.
 *
 * El acceso lo decide `adminGuard`. Ese guard es comodidad de interfaz: la
 * seguridad real está en RLS y en las funciones de la migración 0007, que
 * vuelven a comprobar `is_admin` dentro de Postgres.
 */
@Component({
  selector: 'app-admin',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Admin {
  private readonly auth = inject(AuthService);

  readonly adminName = this.auth.user;

  readonly sections: readonly AdminSection[] = [
    {
      path: 'versiones',
      label: 'Versiones',
      description: 'Historial de versiones del sitio',
    },
    { path: 'pedidos', label: 'Pedidos', description: 'Pedidos del catalogo y su estado' },
    { path: 'inventario', label: 'Inventario', description: 'Catalogo, Auto Hub y noticias' },
    { path: 'usuarios', label: 'Usuarios', description: 'Cuentas, verificacion y permisos' },
  ];
}
