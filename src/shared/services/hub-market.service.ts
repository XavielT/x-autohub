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
    const featured = HUB_MARKET_ITEMS_MOCK.filter(item => item.category === 'vehiculos' && item.isFeatured && item.vehicleSpecs).sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

    if (featured.length >= limit) {
      return featured.slice(0, limit);
    }

    //Fallback: complete with the recent items if not included
    const featuredIds = new Set(featured.map(f => f.id));
    const recent = HUB_MARKET_ITEMS_MOCK.filter(item => item.category === 'vehiculos' && item.vehicleSpecs && !featuredIds.has(item.id)).sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

    return [...featured, ...recent].slice(0, limit);

    /*return HUB_MARKET_ITEMS_MOCK
      .filter(item => item.category === 'vehiculos' && item.isFeatured && item.vehicleSpecs)
      .slice(0, limit);*/
  }

  addItem(item: HubMarketItemModel): void {
    HUB_MARKET_ITEMS_MOCK.push(item);
  }
}
