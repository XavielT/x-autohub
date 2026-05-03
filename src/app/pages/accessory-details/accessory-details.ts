import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-accessory-details',
  imports: [CommonModule],
  templateUrl: './accessory-details.html',
  styleUrl: './accessory-details.scss',
})
export class AccessoryDetails implements OnInit {
  accessory: HubMarketItemModel | undefined;

  constructor(
    private route: ActivatedRoute,
    private hubMarketService: HubMarketService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.accessory = this.hubMarketService.getById(id);
    });
  }
}