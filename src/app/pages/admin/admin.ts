import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';

interface AdminSection {
  path: string;
  label: string;
  description: string;
  /** true si un moderador también puede abrirla. Ver `sections`. */
  forModerators?: boolean;
}

/**
 * Contenedor del panel de administración.
 *
 * Solo dibuja la navegación entre submódulos; cada uno se carga por su propia
 * ruta hija con `loadComponent`, así que entrar al panel no descarga el código
 * de las cuatro secciones.
 *
 * La entrada la decide `moderatorGuard`; cada sección de admin se protege
 * además con `adminGuard` en su propia ruta. Los guards son comodidad de
 * interfaz: la seguridad real está en RLS y en las funciones de las migraciones
 * 0007, 0011 y 0012, que vuelven a comprobar el rol dentro de Postgres.
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
  readonly isAdmin = this.auth.isAdmin;

  /** Etiqueta del rol para el encabezado: dice a quién pertenece la sesión. */
  readonly roleLabel = computed(() => (this.auth.isAdmin() ? 'Administrador' : 'Moderador'));

  private readonly allSections: readonly AdminSection[] = [
    {
      path: 'moderacion',
      label: 'Moderacion',
      description: 'Publicaciones que esperan revision',
      forModerators: true,
    },
    {
      path: 'versiones',
      label: 'Versiones',
      description: 'Historial de versiones del sitio',
    },
    { path: 'pedidos', label: 'Pedidos', description: 'Pedidos del catalogo y su estado' },
    { path: 'inventario', label: 'Inventario', description: 'Catalogo, Auto Hub y noticias' },
    { path: 'usuarios', label: 'Usuarios', description: 'Cuentas, verificacion y permisos' },
  ];

  /**
   * Las pestañas que el rol puede abrir de verdad.
   *
   * No es solo cosmética: dibujarle a un moderador una pestaña que su
   * `adminGuard` va a rebotar lo manda a la raíz con un mensaje de error por
   * hacer clic donde le ofrecimos. Se esconde lo que no puede abrir.
   */
  readonly sections = computed(() =>
    this.allSections.filter((section) => this.auth.isAdmin() || section.forModerators),
  );
}
