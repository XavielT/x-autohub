import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Comunidad: una tarjeta que lleva a `/social-hub`. Nada más. La comunidad es
 * parte del sitio pero no es por quien se diseña el home, y el hero que antes
 * abría la página vive ahora en la propia página de la comunidad.
 */
@Component({
  selector: 'app-home-community',
  imports: [RouterLink],
  templateUrl: './home-community.html',
  styleUrl: './home-community.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeCommunity {}
