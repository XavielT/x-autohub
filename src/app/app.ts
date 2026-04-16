import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LogoHub } from '../shared/components/logo-hub/logo-hub';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LogoHub],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('x-autohub');
}
