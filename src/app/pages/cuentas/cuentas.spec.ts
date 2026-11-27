import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Cuentas } from './cuentas';
import { SiteSettingsService } from '../../../shared/services/site-settings.service';
import { ToastService } from '../../../shared/services/toast.service';
import { BankAccount } from '../../../shared/models/order.model';

describe('Cuentas', () => {
  const real: BankAccount = { bank: 'Banco Popular', holder: 'X AutoHub SRL', number: '123-456-789', type: 'Corriente', isExample: false };
  const ejemplo: BankAccount = { bank: 'Banco de ejemplo', holder: 'Titular', number: '000', type: 'Ahorro', isExample: true };

  async function montar(accounts: BankAccount[]) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: SiteSettingsService, useValue: { getBankAccounts: () => of(accounts), getBusinessProfile: () => of({ legalName: 'X AutoHub SRL', rnc: '131-00000-1' }) } },
      ],
    });
    const fixture = TestBed.createComponent(Cuentas);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('muestra las cuentas reales y nunca las de ejemplo', async () => {
    const { el } = await montar([real, ejemplo]);

    expect(el.textContent).toContain('Banco Popular');
    expect(el.textContent).toContain('123-456-789');
    expect(el.textContent).not.toContain('Banco de ejemplo');
    expect(el.textContent).toContain('Descargar en PDF');
  });

  it('sin cuentas reales ofrece pedir los datos por WhatsApp y no el PDF', async () => {
    const { el } = await montar([ejemplo]);

    expect(el.textContent).toContain('Pedir los datos por WhatsApp');
    expect(el.textContent).not.toContain('Descargar en PDF');
  });

  it('el botón descarga el PDF', async () => {
    const { el } = await montar([real]);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin red'))));
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:x');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

    (el.querySelector('.cta__actions button') as HTMLButtonElement).click();
    // El logo falla sin red y el PDF sale igual, con el nombre en letras.
    await vi.waitFor(() => expect(click).toHaveBeenCalled());
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
