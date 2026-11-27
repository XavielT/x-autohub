import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BankAccount } from '../../../shared/models/order.model';
import { SeoService } from '../../../shared/services/seo.service';
import { SiteSettingsService, realBankAccounts } from '../../../shared/services/site-settings.service';
import { ToastService } from '../../../shared/services/toast.service';
import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { PdfBusiness, downloadBankAccountsPdf } from '../../../shared/utils/bank-accounts-pdf';
import { STORE_PHONE_DISPLAY, storeWhatsAppLink } from '../../../shared/utils/contact';

/**
 * "Cuentas para pagar": las cuentas bancarias de X AutoHub para depósitos y transferencias, con botón de copiar
 * y un PDF descargable. Salen de `site_settings.bank_accounts` (las que se editan en /admin/ajustes), sin las de
 * ejemplo. Cualquiera la ve, sin sesión: es justo lo que un cliente necesita para pagar. No se indexa.
 */
@Component({
  selector: 'app-cuentas',
  imports: [RouterLink, Skeleton],
  templateUrl: './cuentas.html',
  styleUrl: './cuentas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cuentas implements OnInit {
  private readonly settings = inject(SiteSettingsService);
  private readonly toast = inject(ToastService);
  private readonly seo = inject(SeoService);

  readonly accounts = signal<BankAccount[]>([]);
  readonly isLoading = signal(true);
  /** Razón social y RNC de `business_profile`: salen en el PDF. */
  private readonly business = signal<PdfBusiness>({});
  readonly phone = STORE_PHONE_DISPLAY;
  readonly whatsappLink = storeWhatsAppLink('Hola X AutoHub, quiero pagar un pedido. ¿Me confirman los datos de la cuenta?');

  constructor() {
    this.seo.set({
      title: 'Cuentas para pagar | X AutoHub',
      description: 'Las cuentas bancarias de X AutoHub para depósitos y transferencias.',
      path: '/cuentas',
      noindex: true,
    });
    inject(DestroyRef).onDestroy(() => this.seo.reset());
  }

  ngOnInit(): void {
    this.settings.getBusinessProfile().subscribe({
      next: (profile) => this.business.set({ legalName: profile.legalName, rnc: profile.rnc }),
      error: () => undefined,
    });
    this.settings.getBankAccounts().subscribe({
      next: (list) => {
        this.accounts.set(realBankAccounts(list));
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  async copy(text: string, what: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show(`${what} copiado.`);
    } catch {
      this.toast.show('No pudimos copiarlo. Selecciónalo y cópialo.', 'error');
    }
  }

  downloadPdf(): Promise<void> {
    return downloadBankAccountsPdf(this.accounts(), this.business());
  }
}
