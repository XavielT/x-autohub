import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LogoHub } from '../shared/components/logo-hub/logo-hub';
import { Navbar } from '../shared/components/navbar/navbar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LogoHub, Navbar],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('x-autohub');
}
