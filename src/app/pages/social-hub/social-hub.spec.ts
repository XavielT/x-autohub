import { TestBed } from '@angular/core/testing';

import { SocialHub } from './social-hub';

describe('SocialHub (la Comunidad)', () => {
  async function montar() {
    const fixture = TestBed.createComponent(SocialHub);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('se crea', async () => {
    const { c } = await montar();
    expect(c).toBeTruthy();
  });

  it('abre con el hero que antes era del home, con el texto de la comunidad', async () => {
    const { el } = await montar();

    expect(el.querySelector('app-home-welcome')).not.toBeNull();
    expect(el.querySelector('video')).not.toBeNull();
    expect(el.querySelector('.home-welcome-info h1')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'LA ESCENA AUTOMOTRIZ DE RD',
    );
    // El badge de siempre, no uno nuevo.
    expect(el.querySelector('app-highlight-badge')).not.toBeNull();
    // Y nada del copy viejo del home.
    expect(el.textContent).not.toContain('EL HUB CENTRAL');
    expect(el.textContent).not.toContain('Explorar Marketplace');
  });

  it('en la interfaz se llama Comunidad, no Social Hub', async () => {
    const { el } = await montar();

    expect(el.querySelector('.social__title h2')?.textContent?.trim()).toBe('La Comunidad');
    expect(el.textContent).not.toContain('Social Hub');
    expect(el.querySelector('[role=tablist]')?.getAttribute('aria-label')).toBe('Secciones de la comunidad');
  });

  it('los botones del hero cambian a Clubes y a Eventos y bajan hasta las pestañas', async () => {
    const { fixture, c, el } = await montar();
    const scroll = vi.fn();
    el.querySelector<HTMLElement>('.social__tabs')!.scrollIntoView = scroll;
    const [clubs, events] = Array.from(el.querySelectorAll<HTMLButtonElement>('.home-welcome-cta button'));
    expect([clubs.textContent?.trim(), events.textContent?.trim()]).toEqual(['Ver clubes', 'Ver eventos']);

    clubs.click();
    fixture.detectChanges();
    expect(c.activeTab()).toBe('clubes');
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

    events.click();
    fixture.detectChanges();
    expect(c.activeTab()).toBe('eventos');
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it('trae la suscripcion al club, que antes vivia al final del home', async () => {
    const { el } = await montar();
    expect(el.querySelector('app-club-channel')).not.toBeNull();
  });

  it('el feed, los clubes y los eventos siguen donde estaban', async () => {
    const { fixture, c, el } = await montar();
    expect(el.querySelectorAll('.post').length).toBeGreaterThan(0);

    c.selectTab('clubes');
    fixture.detectChanges();
    expect(el.querySelectorAll('.club').length).toBeGreaterThan(0);

    c.selectTab('eventos');
    fixture.detectChanges();
    expect(el.querySelectorAll('.event').length).toBeGreaterThan(0);
  });
});
