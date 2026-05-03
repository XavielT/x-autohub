import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HubMarketItemModel } from '../../models/hub-market-item.model';

@Component({
  selector: 'app-hub-market-card',
  imports: [RouterLink, CommonModule],
  templateUrl: './hub-market-card.html',
  styleUrls: ['./hub-market-card.scss'],
})
export class HubMarketCard {
  @Input({required:true}) item!: HubMarketItemModel;

  get itemLink(): string[] {
    if (this.item.category === 'vehiculos') {
      return ['/car-details', this.item.id.toString()];
    } else if (this.item.category === 'piezas') {
      return ['/hub-market-part-details', this.item.id.toString()];
    } else if (this.item.category === 'accesorios') {
      return ['/hub-market-part-details', this.item.id.toString()];
    }
    return ['/hub-market'];
  }

  get displayCategory(): string {
    switch (this.item.category) {
      case 'vehiculos': return 'Vehículo';
      case 'piezas': return 'Pieza';
      case 'accesorios': return 'Accesorio';
      default: return 'Item';
    }
  }
}