import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ServiciosCardService } from '../../../shared/services/servicios-card.service';
import { storeWhatsAppLink } from '../../../shared/utils/contact';

/** Cuántos servicios se destacan en el banner. */
const FEATURED = 4;

/**
 * El banner del taller: dos botones (cotizar por WhatsApp, agendar cita) y los
 * primeros servicios del catálogo.
 */
@Component({
  selector: 'app-home-services-banner',
  imports: [RouterLink],
  templateUrl: './home-services-banner.html',
  styleUrl: './home-services-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeServicesBanner {
  readonly services = toSignal(
    inject(ServiciosCardService).getServicios().pipe(map((all) => all.slice(0, FEATURED))),
    { initialValue: [] },
  );

  readonly quoteLink = storeWhatsAppLink('Hola X AutoHub, quiero cotizar un servicio');
}
