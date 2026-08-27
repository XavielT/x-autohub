import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { PageCounterOverview } from './page-counter-overview';
import { SiteSettingsService, StatsMode } from '../../../shared/services/site-settings.service';
import { StatsService } from '../../../shared/services/stats.service';
import { SiteStats } from '../../../shared/models/site-stats.model';

/**
 * Qué números pinta la fila del home.
 *
 * Era HTML a mano ("280+", "1.3K", "2.8K") con el sitio teniendo 6 vehículos.
 * Lo que se fija aquí: que el ajuste manda, que en modo real **no aparece
 * ningún "+"** inventado, y que si la lectura falla la portada no se queda con
 * el hueco vacío.
 */
describe('PageCounterOverview', () => {
  class FakeSettings {
    mode: StatsMode = 'showcase';
    fail = false;

    getStatsMode(): Observable<StatsMode> {
      return this.fail ? throwError(() => new Error('sin base')) : of(this.mode);
    }
  }

  class FakeStats {
    stats: SiteStats = { vehicles: 10, parts: 35, members: 2 };
    calls = 0;

    getSiteStats(): Observable<SiteStats> {
      this.calls++;
      return of(this.stats);
    }
  }

  let settings: FakeSettings;
  let stats: FakeStats;

  async function montar(): Promise<ComponentFixture<PageCounterOverview>> {
    await TestBed.configureTestingModule({
      imports: [PageCounterOverview],
      providers: [
        { provide: SiteSettingsService, useValue: settings as unknown as SiteSettingsService },
        { provide: StatsService, useValue: stats as unknown as StatsService },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PageCounterOverview);
    await fixture.whenStable();
    return fixture;
  }

  /** Los tres números tal como los ve alguien mirando la página. */
  function numeros(fixture: ComponentFixture<PageCounterOverview>): string[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.pg-cnt-number'),
    ).map((el) => (el.textContent ?? '').trim());
  }

  beforeEach(() => {
    settings = new FakeSettings();
    stats = new FakeStats();
  });

  it('should create', async () => {
    const fixture = await montar();
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('modo impresion', () => {
    it('pinta las cadenas de siempre', async () => {
      const fixture = await montar();

      expect(numeros(fixture)).toEqual(['280+', '1.3K', '2.8K']);
    });

    it('no le pide los conteos a la base', async () => {
      // Mientras el interruptor este en impresion —que es el valor por
      // defecto— cada visitante anonimo se ahorra la RPC.
      await montar();

      expect(stats.calls).toBe(0);
    });

    it('conserva las etiquetas y el diseño', async () => {
      const fixture = await montar();
      const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';

      expect(texto).toContain('Vehiculos');
      expect(texto).toContain('Listados activos');
      expect(texto).toContain('Piezas');
      expect(texto).toContain('Miembros');
      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.pg-cnt-container').length,
      ).toBe(3);
    });
  });

  describe('modo real', () => {
    it('pinta los conteos de verdad', async () => {
      settings.mode = 'real';
      const fixture = await montar();

      expect(stats.calls).toBe(1);
      expect(numeros(fixture)).toEqual(['10', '35', '2']);
    });

    it('formatea en compacto los numeros grandes', async () => {
      settings.mode = 'real';
      stats.stats = { vehicles: 1250, parts: 12_345, members: 2_400_000 };
      const fixture = await montar();

      expect(numeros(fixture)).toEqual(['1.3K', '12K', '2.4M']);
    });

    it('nunca añade un "+" a un numero real', async () => {
      settings.mode = 'real';
      stats.stats = { vehicles: 280, parts: 1300, members: 2800 };
      const fixture = await montar();

      // Mismos valores que las cadenas de impresion, pero sin su promesa.
      expect(numeros(fixture)).toEqual(['280', '1.3K', '2.8K']);
      expect(numeros(fixture).join('')).not.toContain('+');
    });
  });

  describe('cuando algo falla', () => {
    it('cae a los numeros de impresion y no deja el hueco vacio', async () => {
      settings.fail = true;
      const fixture = await montar();

      expect(numeros(fixture)).toEqual(['280+', '1.3K', '2.8K']);
    });
  });
});
