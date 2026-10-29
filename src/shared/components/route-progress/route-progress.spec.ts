import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouteProgress } from './route-progress';

describe('RouteProgress', () => {
  it('arranca con la navegación y termina al llegar', async () => {
    vi.useFakeTimers();
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: 'a', children: [] }]);
    const fixture = TestBed.createComponent(RouteProgress);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    expect(c.state()).toBe('idle');

    const nav = router.navigateByUrl('/a');
    expect(c.state()).toBe('loading');
    await nav;
    expect(c.state()).toBe('done');

    vi.advanceTimersByTime(300);
    expect(c.state()).toBe('idle');
    vi.useRealTimers();
  });

  it('una navegación cancelada (ruta que no existe) también la cierra', async () => {
    vi.useFakeTimers();
    const router = TestBed.inject(Router);
    router.resetConfig([]);
    const fixture = TestBed.createComponent(RouteProgress);
    fixture.detectChanges();

    await router.navigateByUrl('/nada').catch(() => undefined);
    expect(['done', 'idle']).toContain(fixture.componentInstance.state());
    vi.useRealTimers();
  });

  it('pinta una barra de 2px que se prende con el estado', () => {
    const fixture = TestBed.createComponent(RouteProgress);
    fixture.detectChanges();
    const bar = (fixture.nativeElement as HTMLElement).querySelector('.rp')!;
    expect(bar.classList.contains('rp--on')).toBe(false);

    fixture.componentInstance.state.set('loading');
    fixture.detectChanges();
    expect(bar.classList.contains('rp--on')).toBe(true);
  });
});
