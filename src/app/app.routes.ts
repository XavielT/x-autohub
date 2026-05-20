import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { CatalogoComponent } from './pages/catalogo/catalogo';
import { HubMarketComponent } from './pages/hub-market/hub-market';
import { SocialHubComponent } from './pages/social-hub/social-hub';
import { CarDetails } from './pages/car-details/car-details';
import { NewDetails } from './pages/new-details/new-details';
import { TerminosCondiciones } from './pages/terminos-condiciones/terminos-condiciones';
import { HubPartDetails } from './pages/hub-part-details/hub-part-details';
import { AccessoryDetails } from './pages/accessory-details/accessory-details';
import { PublicarComponent } from './pages/publicar/publicar';
import { CheckoutComponent } from './pages/checkout/checkout';
import { HubMarketPartDetails } from './pages/hub-market-part-details/hub-market-part-details';
import { AutoHub } from './pages/auto-hub/auto-hub';
import { Servicios } from './pages/servicios/servicios';
import { AutoHubDetails } from './pages/auto-hub-details/auto-hub-details';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'catalogo', component: CatalogoComponent },
  { path: 'hub-part-details/:id', component: HubPartDetails},
  { path: 'hub-market-part-details/:id', component: HubMarketPartDetails},
  { path: 'accessory-details/:id', component: AccessoryDetails},
  { path: 'publicar', component: PublicarComponent},
  { path: 'hub-market', component: HubMarketComponent },
  { path: 'social-hub', component: SocialHubComponent },
  { path: 'car-details/:id', component: CarDetails },
  { path: 'news/:id', component: NewDetails},
  { path: 'terminos-condiciones', component: TerminosCondiciones},
  { path: 'checkout', component: CheckoutComponent },
  { path: 'auto-hub', component: AutoHub},
  { path: 'auto-hub-details/:id', component: AutoHubDetails},
  { path: 'servicios', component: Servicios},
];
