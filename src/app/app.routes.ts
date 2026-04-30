import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { CatalogoComponent } from './pages/catalogo/catalogo';
import { HubMarketComponent } from './pages/hub-market/hub-market';
import { SocialHubComponent } from './pages/social-hub/social-hub';
import { CarDetails } from './pages/car-details/car-details';
import { NewDetails } from './pages/new-details/new-details';
import { TerminosCondiciones } from './pages/terminos-condiciones/terminos-condiciones';
import { HubPartDetails } from './pages/hub-part-details/hub-part-details';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'catalogo', component: CatalogoComponent },
  { path: 'hub-part-details/:id', component: HubPartDetails},
  { path: 'hub-market', component: HubMarketComponent },
  { path: 'social-hub', component: SocialHubComponent },
  { path: 'car-details/:id', component: CarDetails },
  { path: 'news/:id', component: NewDetails},
  { path: 'terminos-condiciones', component: TerminosCondiciones}
];
