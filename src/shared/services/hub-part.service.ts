import { Injectable } from '@angular/core';
import { HubPartModel } from '../models/hub-part.model';
import { HUB_PART_MOCK } from '../models/hub-part.mock';

@Injectable({
  providedIn: 'root'
})
export class HubPartService {

  // TODO: inject HttpClient here when connecting real API
  // constructor(private http: HttpClient) {}

  getAll(): HubPartModel[] {
    // TODO: return this.http.get<HubPartModel[]>('/api/hub-parts');
    return HUB_PART_MOCK;
  }

  getById(id: number): HubPartModel | undefined {
    // TODO: return this.http.get<HubPartModel>(`/api/hub-parts/${id}`);
    return HUB_PART_MOCK.find(p => p.id === id);
  }

  getByCategory(category: string): HubPartModel[] {
    // TODO: return this.http.get<HubPartModel[]>(`/api/hub-parts?category=${category}`);
    return HUB_PART_MOCK.filter(p => p.category === category);
  }
}