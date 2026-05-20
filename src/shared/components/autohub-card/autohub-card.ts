import { Component, Input } from '@angular/core';
import { AutoHubModel } from '../../models/auto-hub.model';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-autohub-card',
  imports: [CommonModule, RouterLink],
  templateUrl: './autohub-card.html',
  styleUrl: './autohub-card.scss',
})
export class AutohubCard {
  @Input ({required:true}) autoHub!: AutoHubModel;
}
