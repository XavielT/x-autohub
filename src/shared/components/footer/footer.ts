import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { LogoHub } from '../logo-hub/logo-hub';
import { AuthService } from '../../services/auth.service';
import { CategoryService } from '../../services/category.service';
import { STORE_PHONE_DISPLAY, storeWhatsAppLink } from '../../utils/contact';

@Component({
  selector: 'app-footer',
  imports: [LogoHub, RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Footer {
  private readonly categories = inject(CategoryService);

  readonly isLoggedIn = inject(AuthService).isLoggedIn;
  /** Las categorías de primer nivel: la columna "Tienda". */
  readonly categoryTree = toSignal(this.categories.getTree(), { initialValue: [] });

  readonly phone = STORE_PHONE_DISPLAY;
  readonly whatsappLink = storeWhatsAppLink('Hola X AutoHub');
  readonly quoteLink = storeWhatsAppLink('Hola X AutoHub, quiero cotizar un servicio');
}
