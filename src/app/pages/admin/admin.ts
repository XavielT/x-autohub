import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';
import { AdminService } from '../../../shared/services/admin.service';
import { AdminServicesService } from '../../../shared/services/admin-services.service';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { AdminPublicar } from './publicar/admin-publicar';
import { AdminHoy } from './hoy/admin-hoy';
import { Icon, IconName } from '../../../shared/ui/icon/icon';

interface AdminSection {
  path: string;
  label: string;
  description: string;
  /** Icono de la tarjeta, para reconocerla de un vistazo. */
  icon: IconName;
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AdminPublicar, AdminHoy, Icon],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Admin {
  private readonly auth = inject(AuthService);
  private readonly hubMarket = inject(HubMarketService);
  private readonly admin = inject(AdminService);
  private readonly adminServices = inject(AdminServicesService);

  /** Publicaciones que esperan revisión: el número de la insignia de "Moderación". */
  readonly pendingCount = signal(0);
  /** Pedidos que esperan algo de ti (comprobante por revisar, pagados por preparar) y citas por confirmar. */
  readonly ordersCount = signal(0);
  readonly appointmentsCount = signal(0);

  /** El número de la insignia de cada pestaña, o 0 si no lleva. */
  badgeOf(path: string): number {
    switch (path) {
      case 'moderacion': return this.pendingCount();
      case 'pedidos': return this.ordersCount();
      case 'taller': return this.appointmentsCount();
      default: return 0;
    }
  }

  readonly adminName = this.auth.user;
  readonly isAdmin = this.auth.isAdmin;

  /** Etiqueta del rol para el encabezado: dice a quién pertenece la sesión. */
  readonly roleLabel = computed(() => (this.auth.isAdmin() ? 'Administrador' : 'Moderador'));

  private readonly allSections: readonly AdminSection[] = [
    {
      path: 'moderacion', icon: 'shield-check',
      label: 'Moderación',
      description: 'Publicaciones que esperan revisión',
      forModerators: true,
    },
    {
      path: 'versiones', icon: 'tag',
      label: 'Versiones',
      description: 'Historial de versiones del sitio',
    },
    { path: 'pedidos', icon: 'package', label: 'Pedidos', description: 'Pedidos del catálogo y su estado' },
    { path: 'cupones', icon: 'ticket', label: 'Cupones', description: 'Códigos de descuento del checkout' },
    { path: 'taller', icon: 'wrench', label: 'Taller', description: 'Citas, servicios, horario y trabajos' },
    { path: 'inventario', icon: 'boxes', label: 'Inventario', description: 'Catálogo, Auto Hub y noticias' },
    { path: 'marca', icon: 'image', label: 'Marca', description: 'Ponle la insignia de X AutoHub a tus fotos' },
    { path: 'documentos', icon: 'file-text', label: 'Documentos', description: 'Cotizaciones y facturas para tus clientes' },
    { path: 'clientes', icon: 'contact', label: 'Clientes', description: 'Tus clientes, sus datos y sus vehículos' },
    { path: 'usuarios', icon: 'users', label: 'Usuarios', description: 'Cuentas, verificación y permisos' },
    { path: 'ajustes', icon: 'sliders', label: 'Ajustes', description: 'Cuentas para transferir y dirección de retiro' },
  ];

  /**
   * Las pestañas que el rol puede abrir de verdad.
   *
   * No es solo cosmética: dibujarle a un moderador una pestaña que su
   * `adminGuard` va a rebotar lo manda a la raíz con un mensaje de error por
   * hacer clic donde le ofrecimos. Se esconde lo que no puede abrir.
   */
  constructor() {
    // La insignia es un extra: si la consulta falla, la pestaña queda sin número.
    this.hubMarket.getPending().subscribe({
      next: (items) => this.pendingCount.set(items.length),
      error: () => undefined,
    });
    if (this.auth.isAdmin()) {
      this.admin.getOrders().subscribe({
        next: (orders) =>
          this.ordersCount.set(
            orders.filter((o) => o.status === 'paid' || o.status === 'pending' || (o.status === 'awaiting_payment' && o.proofPath)).length,
          ),
        error: () => undefined,
      });
      this.adminServices.getAppointments().subscribe({
        next: (list) => this.appointmentsCount.set(list.filter((a) => a.status === 'requested').length),
        error: () => undefined,
      });
    }
  }

  readonly sections = computed(() =>
    this.allSections.filter((section) => this.auth.isAdmin() || section.forModerators),
  );
}
