import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { SeoService } from '../../../shared/services/seo.service';

@Component({
  selector: 'app-terminos-condiciones',
  imports: [],
  templateUrl: './terminos-condiciones.html',
  styleUrl: './terminos-condiciones.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TerminosCondiciones {
  private readonly seo = inject(SeoService);

  constructor() {
    this.seo.set({
      title: 'Términos y condiciones | X AutoHub',
      description:
        'Las condiciones de uso de X AutoHub: compras, citas del taller, publicaciones de la comunidad y privacidad.',
      path: '/terminos-condiciones',
    });
    inject(DestroyRef).onDestroy(() => this.seo.reset());
  }
}
