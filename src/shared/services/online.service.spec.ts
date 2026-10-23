import { TestBed } from '@angular/core/testing';
import { OnlineService } from './online.service';

describe('OnlineService', () => {
  function setOnLine(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
  }

  afterEach(() => setOnLine(true));

  it('arranca con el valor de navigator.onLine', () => {
    setOnLine(false);
    expect(TestBed.inject(OnlineService).isOnline()).toBe(false);
  });

  it('sigue los eventos online y offline, en la señal y en online$', () => {
    setOnLine(true);
    const service = TestBed.inject(OnlineService);
    const seen: boolean[] = [];
    service.online$.subscribe((v) => seen.push(v));

    window.dispatchEvent(new Event('offline'));
    expect(service.isOnline()).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(service.isOnline()).toBe(true);

    // El valor actual al suscribirse, y luego cada cambio.
    expect(seen).toEqual([true, false, true]);
  });
});
