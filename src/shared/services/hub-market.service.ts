import { Injectable } from '@angular/core';
import { HUB_MARKET_ITEMS_MOCK } from '../models/hub-market-item.mock';
import { HubMarketCategory, HubMarketItemModel } from '../models/hub-market-item.model';

@Injectable({
  providedIn: 'root'
})
export class HubMarketService {

  // TODO: inject HttpClient when integrating real API.
  // constructor(private http: HttpClient) {}

  getAll(): HubMarketItemModel[] {
    // TODO: return this.http.get<HubMarketItemModel[]>('/api/hub-market');
    return HUB_MARKET_ITEMS_MOCK;
  }

  getById(id: number): HubMarketItemModel | undefined {
    // TODO: return this.http.get<HubMarketItemModel>(`/api/hub-market/${id}`);
    return HUB_MARKET_ITEMS_MOCK.find(item => item.id === id);
  }

  getByCategory(category: HubMarketCategory): HubMarketItemModel[] {
    // TODO: return this.http.get<HubMarketItemModel[]>(`/api/hub-market?category=${category}`);
    return HUB_MARKET_ITEMS_MOCK.filter(item => item.category === category);
  }

  getFeaturedVehicles(limit = 3): HubMarketItemModel[] {
    return HUB_MARKET_ITEMS_MOCK
      .filter(item => item.category === 'vehiculos' && item.isFeatured && item.vehicleSpecs)
      .slice(0, limit);
  }

  addItem(item: HubMarketItemModel): void {
    HUB_MARKET_ITEMS_MOCK.push(item);
  }
}
