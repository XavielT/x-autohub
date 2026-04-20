import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { CatalogoComponent } from './pages/catalogo/catalogo';
import { HubMarketComponent } from './pages/hub-market/hub-market';
import { SocialHubComponent } from './pages/social-hub/social-hub';
import { CarDetails } from './pages/car-details/car-details';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'catalogo', component: CatalogoComponent },
  { path: 'hub-market', component: HubMarketComponent },
  { path: 'social-hub', component: SocialHubComponent },
  { path: 'car-details', component: CarDetails },
];
