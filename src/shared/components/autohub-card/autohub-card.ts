import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AutoHubModel } from '../../models/auto-hub.model';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TestBadge } from '../../ui/test-badge/test-badge';

@Component({
  selector: 'app-autohub-card',
  imports: [CommonModule, RouterLink, NgOptimizedImage, TestBadge],
  templateUrl: './autohub-card.html',
  styleUrl: './autohub-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutohubCard {
  readonly autoHub = input.required<AutoHubModel>();
}
