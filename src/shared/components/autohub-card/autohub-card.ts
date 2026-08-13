import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AutoHubModel } from '../../models/auto-hub.model';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-autohub-card',
  imports: [CommonModule, RouterLink, NgOptimizedImage],
  templateUrl: './autohub-card.html',
  styleUrl: './autohub-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutohubCard {
  readonly autoHub = input.required<AutoHubModel>();
}
