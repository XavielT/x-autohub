import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { buildWaLink } from '../../../shared/utils/whatsapp';

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

  /** Enlace de WhatsApp al vendedor, o cadena vacía si no dejó teléfono. */
  readonly waLink = computed(() => {
    const accessory = this.accessory();
    if (!accessory?.contactPhone) return '';
    return buildWaLink(
      accessory.contactPhone,
      `Hola! Vi tu publicacion "${accessory.title}" en X AutoHub y me interesa.`,
    );
  });

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
