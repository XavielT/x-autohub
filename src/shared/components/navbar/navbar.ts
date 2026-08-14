import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { LogoHub } from '../logo-hub/logo-hub';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-navbar',
  imports: [LogoHub, RouterModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Navbar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly isLoggedIn = this.auth.isLoggedIn;
  readonly user = this.auth.user;
  /** La entrada al panel solo se dibuja para un admin. Ver `adminGuard`. */
  readonly isAdmin = this.auth.isAdmin;

  readonly isMobileMenuOpen = signal(false);

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  logout(): void {
    this.auth.logout();
    this.closeMobileMenu();
    this.toast.show('Sesion cerrada.');
    void this.router.navigateByUrl('/');
  }
}
