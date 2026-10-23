import { ChangeDetectionStrategy, Component } from '@angular/core';

interface TrustItem {
  icon: string;
  title: string;
  text: string;
}

/**
 * La franja de confianza: lo que el visitante necesita saber antes de comprar,
 * en cuatro frases. Es contenido fijo, sin datos: lo que dice tiene que ser
 * cierto hoy (envío nacional, retiro en el taller, transferencia o WhatsApp,
 * instalación) y se revisa cuando cambie la política, no con un servicio.
 */
@Component({
  selector: 'app-home-trust-strip',
  templateUrl: './home-trust-strip.html',
  styleUrl: './home-trust-strip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeTrustStrip {
  readonly items: readonly TrustItem[] = [
    { icon: 'assets/icons/bag-hub-icon.svg', title: 'Envío nacional', text: 'A todo el país' },
    { icon: 'assets/icons/location-hub-icon.svg', title: 'Retiro en tienda', text: 'Pasa por el taller' },
    { icon: 'assets/icons/whatsapp-w-icon.svg', title: 'Transferencia o WhatsApp', text: 'Pagas como prefieras' },
    { icon: 'assets/icons/mechanic-tools-hub-icon.svg', title: 'Instalación disponible', text: 'Te lo ponemos nosotros' },
  ];
}
