import { Injectable } from "@angular/core";
import { AutoHubModel } from "../models/auto-hub.model";
import { AUTO_HUB_MOCK } from "../models/auto-hub.mock";

@Injectable ({
    providedIn: 'root'
})

export class AutoHubService {

    // TODO: inject HttpClient here when connecting real API
  // constructor(private http: HttpClient) {}

  getAll(): AutoHubModel[] {
    // TODO: return this.http.get<HubPartModel[]>('/api/hub-parts');
    return AUTO_HUB_MOCK;
  }

  getById(id: number): AutoHubModel | undefined {
    // TODO: return this.http.get<HubPartModel>(`/api/hub-parts/${id}`);
    return AUTO_HUB_MOCK.find(auto => auto.id === id);
  }

  /*getByCategory(category: string): AutoHubModel[] {
    // TODO: return this.http.get<HubPartModel[]>(`/api/hub-parts?category=${category}`);
    return AUTO_HUB_MOCK.filter(p => p.category === category);
  }*/
}