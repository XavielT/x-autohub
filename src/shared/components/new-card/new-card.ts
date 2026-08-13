import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { InfoBadge } from '../../ui/info-badge/info-badge';
import { NewCardModel } from '../../models/new-card.model';
import { DatePipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-new-card',
  imports: [InfoBadge, DatePipe, RouterLink, NgOptimizedImage],
  templateUrl: './new-card.html',
  styleUrl: './new-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewCard {
  readonly newCard = input.required<NewCardModel>();
}
