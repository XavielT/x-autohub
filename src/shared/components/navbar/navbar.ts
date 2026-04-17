import { Component } from '@angular/core';
import { LogoHub } from '../logo-hub/logo-hub';
import { RouterModule } from '@angular/router';
@Component({
  selector: 'app-navbar',
  imports: [LogoHub, RouterModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar {
  isMobileMenuOpen = false;

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
  }
}
