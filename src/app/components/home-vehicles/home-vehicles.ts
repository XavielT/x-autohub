import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CarCard } from '../../../shared/components/car-card/car-card';
import { HubMarketService } from '../../../shared/services/hub-market.service';

/**
 * Vehículos: dos tarjetas grandes (Auto Hub y Hub Market) y los últimos tres
 * vehículos publicados. Los vehículos ya no son el centro del sitio, pero siguen
 * a un toque.
 *
 * Las dos tarjetas se mantienen separadas a propósito: Auto Hub son los carros
 * que vende X AutoHub y Hub Market los que publica la comunidad. Son dos promesas
 * distintas y no se funden en una lista.
 */
@Component({
  selector: 'app-home-vehicles',
  imports: [RouterLink, CarCard],
  templateUrl: './home-vehicles.html',
  styleUrl: './home-vehicles.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeVehicles {
  readonly latest = toSignal(inject(HubMarketService).getLatestVehicles(3), { initialValue: [] });
}
