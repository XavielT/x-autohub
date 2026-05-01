import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LogoHub } from '../shared/components/logo-hub/logo-hub';
import { Navbar } from '../shared/components/navbar/navbar';
import { Footer } from '../shared/components/footer/footer';
import { CartModal } from '../shared/components/cart-modal/cart-modal';
import { Toast } from '../shared/components/toast/toast';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LogoHub, Navbar, Footer, CartModal, Toast],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('x-autohub');
}
