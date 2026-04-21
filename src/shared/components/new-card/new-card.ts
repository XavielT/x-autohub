import { Component, Input } from '@angular/core';
import { InfoBadge } from '../../ui/info-badge/info-badge';
import { NewCardModel } from '../../models/new-card.model';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-new-card',
  imports: [InfoBadge, DatePipe, RouterLink],
  templateUrl: './new-card.html',
  styleUrl: './new-card.scss',
})
export class NewCard {
  @Input({required:true}) newCard!: NewCardModel;
}
