import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';

@Component({
  selector: 'app-accessory-details',
  imports: [DecimalPipe],
  templateUrl: './accessory-details.html',
  styleUrl: './accessory-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessoryDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly hubMarketService = inject(HubMarketService);

  readonly accessory = signal<HubMarketItemModel | undefined>(undefined);
  readonly isLoading = signal(true);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.isLoading.set(true);

      this.hubMarketService.getById(id).subscribe({
        next: (accessory) => {
          this.accessory.set(accessory);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
    });
  }
}
