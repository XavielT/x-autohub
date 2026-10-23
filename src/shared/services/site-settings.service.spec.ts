import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { SiteSettingsService, realBankAccounts, toBankAccounts, toPickupAddress } from './site-settings.service';

describe('SiteSettingsService: cuentas y retiro (migración 0018)', () => {
  let service: SiteSettingsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(SiteSettingsService);
  });

  afterEach(() => localStorage.clear());

  it('nacen con un valor de ejemplo marcado como tal', async () => {
    const accounts = await firstValueFrom(service.getBankAccounts());
    const pickup = await firstValueFrom(service.getPickupAddress());

    expect(accounts.length).toBe(1);
    expect(accounts[0].isExample).toBe(true);
    expect(pickup?.isExample).toBe(true);
  });

  it('el sitio público no muestra las cuentas de ejemplo', async () => {
    expect(realBankAccounts(await firstValueFrom(service.getBankAccounts()))).toEqual([]);
  });

  it('guardar las cuentas reales las deja visibles, y ya no son de ejemplo', async () => {
    await firstValueFrom(
      service.setBankAccounts([
        { bank: ' Banco Popular ', holder: 'X AutoHub SRL', number: '789012345', type: 'Corriente', isExample: true },
      ]),
    );

    const accounts = await firstValueFrom(service.getBankAccounts());

    expect(accounts).toEqual([
      { bank: 'Banco Popular', holder: 'X AutoHub SRL', number: '789012345', type: 'Corriente', isExample: false },
    ]);
    expect(realBankAccounts(accounts).length).toBe(1);
  });

  it('guardar la dirección de retiro la deja como real', async () => {
    await firstValueFrom(service.setPickupAddress({ address: ' Av. Principal 1 ', hours: 'L-V 8 a 5' }));

    expect(await firstValueFrom(service.getPickupAddress())).toEqual({
      address: 'Av. Principal 1',
      hours: 'L-V 8 a 5',
      isExample: false,
    });
  });

  it('el valor sobrevive a una recarga', async () => {
    await firstValueFrom(service.setPickupAddress({ address: 'Calle 5', hours: '' }));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const otra = TestBed.inject(SiteSettingsService);

    expect((await firstValueFrom(otra.getPickupAddress()))?.address).toBe('Calle 5');
  });
});

describe('toBankAccounts / toPickupAddress', () => {
  it('descarta lo que no es una lista o un objeto', () => {
    expect(toBankAccounts('no soy una lista')).toEqual([]);
    expect(toBankAccounts(null)).toEqual([]);
    expect(toPickupAddress([])).toBeNull();
    expect(toPickupAddress('texto')).toBeNull();
  });

  it('una cuenta a medias (sin banco o sin número) no se muestra', () => {
    const accounts = toBankAccounts([
      { bank: 'Popular', number: '1', holder: 'A', type: 'Corriente' },
      { bank: 'Sin número', holder: 'A' },
      { number: '2' },
      'basura',
      null,
    ]);

    expect(accounts.map((a) => a.bank)).toEqual(['Popular']);
  });

  it('is_example solo vale si es exactamente true', () => {
    expect(toBankAccounts([{ bank: 'B', number: '1', is_example: 'true' }])[0].isExample).toBe(false);
    expect(toBankAccounts([{ bank: 'B', number: '1', is_example: true }])[0].isExample).toBe(true);
  });

  it('una dirección vacía es como no tener dirección', () => {
    expect(toPickupAddress({ address: '  ', hours: 'x' })).toBeNull();
    expect(toPickupAddress({ address: 'Calle 1' })).toEqual({ address: 'Calle 1', hours: '', isExample: false });
  });
});
