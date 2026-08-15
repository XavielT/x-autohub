import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../../shared/services/admin.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { AdminUserModel } from '../../../../shared/models/release.model';
import { UserRole } from '../../../../shared/models/user.model';

/**
 * Cuentas registradas: verificación y roles.
 *
 * **Solo para admin.** Su ruta lleva `adminGuard` aunque el padre `/admin` deje
 * entrar a los moderadores: la lista trae correos y teléfonos de todo el mundo,
 * que es justo lo que 0006 sacó del alcance de las claves del navegador, y desde
 * aquí se reparten permisos. `admin_list_users()` lo vuelve a comprobar dentro
 * de Postgres, así que un moderador que fuerce la URL ve un error, no datos.
 *
 * Cambiar el rol pasa por `set_user_role()` por lo mismo: la política de
 * `profiles` solo deja editar tu propia fila y el trigger de 0005 —extendido en
 * 0011— congela `role`. Antes esto solo se podía hacer con
 * `scripts/make-admin.mjs`.
 */
@Component({
  selector: 'app-admin-usuarios',
  imports: [DatePipe, FormsModule],
  templateUrl: './admin-usuarios.html',
  styleUrl: './admin-usuarios.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsuarios implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly users = signal<AdminUserModel[]>([]);
  readonly isLoading = signal(true);
  readonly search = signal('');
  readonly savingId = signal<string | null>(null);
  /** Segundo clic para confirmar que se da acceso de administrador. */
  readonly pendingPromoteId = signal<string | null>(null);

  /**
   * Los tres roles, con lo que significa cada uno.
   *
   * La descripción no es decoración: quien reparte permisos tiene que ver de un
   * vistazo que "moderador" no es "medio admin" sino un permiso acotado.
   */
  readonly roles: readonly { value: UserRole; label: string; hint: string }[] = [
    { value: 'user', label: 'Usuario', hint: 'Publica y compra. Sin acceso al panel.' },
    { value: 'moderador', label: 'Moderador', hint: 'Solo aprueba o rechaza publicaciones.' },
    { value: 'admin', label: 'Admin', hint: 'Acceso total, incluido repartir roles.' },
  ];

  /** Para no ofrecer quitarse el admin a uno mismo: la función lo rechaza. */
  readonly currentUserId = computed(() => this.auth.user()?.id ?? null);

  readonly filtered = computed(() => {
    const query = this.search().toLowerCase().trim();
    if (!query) return this.users();
    return this.users().filter(
      (u) =>
        u.displayName.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        (u.location ?? '').toLowerCase().includes(query),
    );
  });

  readonly adminCount = computed(() => this.users().filter((u) => u.role === 'admin').length);
  readonly moderatorCount = computed(
    () => this.users().filter((u) => u.role === 'moderador').length,
  );

  roleLabel(role: UserRole): string {
    return this.roles.find((r) => r.value === role)?.label ?? role;
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    this.admin.getUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.isLoading.set(false);
      },
      error: (error: Error) => {
        this.isLoading.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  askPromote(id: string): void {
    this.pendingPromoteId.set(this.pendingPromoteId() === id ? null : id);
  }

  /**
   * Cambia el rol de una cuenta.
   *
   * Dar **admin** es lo único que pide confirmación: quien lo reciba podrá
   * editar el catálogo, los vehículos oficiales, las noticias, ver todos los
   * pedidos y repartir roles. Moderador y usuario no la piden — el primero es un
   * permiso acotado y el segundo es quitar permisos, que es la acción
   * reversible y segura.
   */
  setRole(user: AdminUserModel, role: UserRole): void {
    if (role === user.role) {
      this.pendingPromoteId.set(null);
      return;
    }

    if (role === 'admin' && this.pendingPromoteId() !== user.id) {
      this.pendingPromoteId.set(user.id);
      return;
    }

    this.apply(user, { role, isVerified: null });
    this.pendingPromoteId.set(null);
  }

  toggleVerified(user: AdminUserModel): void {
    this.apply(user, { role: user.role, isVerified: !user.isVerified });
  }

  private apply(
    user: AdminUserModel,
    change: { role: UserRole; isVerified: boolean | null },
  ): void {
    this.savingId.set(user.id);
    this.admin.setUserRole(user.id, change.role, change.isVerified).subscribe({
      next: () => {
        this.savingId.set(null);
        this.users.update((list) =>
          list.map((u) =>
            u.id === user.id
              ? {
                  ...u,
                  role: change.role,
                  isAdmin: change.role === 'admin',
                  isVerified: change.isVerified ?? u.isVerified,
                }
              : u,
          ),
        );
        this.toast.show(`${user.displayName} actualizado.`);
      },
      error: (error: Error) => {
        this.savingId.set(null);
        this.toast.show(error.message, 'error');
      },
    });
  }
}
