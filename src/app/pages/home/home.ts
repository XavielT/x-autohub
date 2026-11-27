import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { JsonLdService } from '../../../shared/services/json-ld.service';
import { SeoService } from '../../../shared/services/seo.service';
import { siteJsonLd } from '../../../shared/utils/structured-data';
import { HomeSearch } from '../../components/home-search/home-search';
import { HomeCategories } from '../../components/home-categories/home-categories';
import { HomeVehiclePicker } from '../../components/home-vehicle-picker/home-vehicle-picker';
import { HomeOffers } from '../../components/home-offers/home-offers';
import { HomeBestsellers } from '../../components/home-bestsellers/home-bestsellers';
import { HomeNewArrivals } from '../../components/home-new-arrivals/home-new-arrivals';
import { HomeServicesBanner } from '../../components/home-services-banner/home-services-banner';
import { HomeTrustStrip } from '../../components/home-trust-strip/home-trust-strip';
import { HomeVehicles } from '../../components/home-vehicles/home-vehicles';
import { HomeCommunity } from '../../components/home-community/home-community';

/**
 * El home del pivote: una tienda, no un escaparate. De arriba abajo: buscador,
 * categorías, "elige tu vehículo", ofertas, más vendidos, nuevos, el banner del
 * taller, la franja de confianza, los vehículos y la comunidad.
 *
 * Cada bloque trae sus propios datos y se oculta solo si no tiene nada que
 * mostrar (sin ofertas, por ejemplo), así que un catálogo recién creado no
 * enseña secciones vacías.
 *
 * `home-welcome`, el hero con video del home anterior, se mudó a `/social-hub`.
 */
@Component({
  selector: 'app-home',
  imports: [
    HomeSearch,
    HomeCategories,
    HomeVehiclePicker,
    HomeOffers,
    HomeBestsellers,
    HomeNewArrivals,
    HomeServicesBanner,
    HomeTrustStrip,
    HomeVehicles,
    HomeCommunity,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  constructor() {
    const seo = inject(SeoService);
    const jsonLd = inject(JsonLdService);
    // Canónica del inicio y los datos de la organización y del buscador del sitio.
    seo.set({
      title: 'X AutoHub — Todo lo que tu carro necesita',
      description:
        'Accesorios y piezas para tu carro, con taller propio, en República Dominicana. Encuentra lo que le sirve a tu vehículo, instálalo con nosotros y mira además vehículos y la comunidad automotriz.',
      path: '/',
    });
    jsonLd.set('site', siteJsonLd());
    inject(DestroyRef).onDestroy(() => {
      seo.reset();
      jsonLd.set('site', null);
    });
  }
}
