import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../../shared/services/admin.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { AdminUserModel } from '../../../../shared/models/release.model';

/**
 * Cuentas registradas: verificación y permisos.
 *
 * Los datos vienen de `admin_list_users()`, no de un select sobre `profiles`:
 * las políticas de columna de la migración 0006 esconden el correo y el teléfono
 * a cualquier sesión del navegador, admin incluido.
 *
 * Otorgar admin pasa por `set_user_admin()` por la misma razón: la política de
 * `profiles` solo deja editar tu propia fila, y un trigger congela `is_admin`.
 * Antes esto solo se podía hacer con `scripts/make-admin.mjs`.
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

  readonly adminCount = computed(() => this.users().filter((u) => u.isAdmin).length);

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
   * Dar admin es sensible: quien lo reciba podrá editar el catálogo, los
   * vehículos oficiales, las noticias y ver todos los pedidos. Por eso pide
   * confirmación; quitarlo no, porque es la acción reversible y segura.
   */
  toggleAdmin(user: AdminUserModel): void {
    this.apply(user, { isAdmin: !user.isAdmin, isVerified: null });
    this.pendingPromoteId.set(null);
  }

  toggleVerified(user: AdminUserModel): void {
    this.apply(user, { isAdmin: user.isAdmin, isVerified: !user.isVerified });
  }

  private apply(
    user: AdminUserModel,
    change: { isAdmin: boolean; isVerified: boolean | null },
  ): void {
    this.savingId.set(user.id);
    this.admin.setUserAdmin(user.id, change.isAdmin, change.isVerified).subscribe({
      next: () => {
        this.savingId.set(null);
        this.users.update((list) =>
          list.map((u) =>
            u.id === user.id
              ? {
                  ...u,
                  isAdmin: change.isAdmin,
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
