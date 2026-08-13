import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-info-badge',
  imports: [],
  templateUrl: './info-badge.html',
  styleUrl: './info-badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoBadge {
  readonly text = input.required<string>();
}
