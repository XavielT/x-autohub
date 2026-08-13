import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LogoHub } from '../logo-hub/logo-hub';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-footer',
  imports: [LogoHub, RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Footer {

}
