import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HighlightBadge } from '../../../shared/ui/highlight-badge/highlight-badge';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-home-welcome',
  imports: [HighlightBadge, RouterModule],
  templateUrl: './home-welcome.html',
  styleUrl: './home-welcome.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeWelcome {

}
