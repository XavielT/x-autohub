import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { WhatsNewModal } from './whats-new-modal';
import { WhatsNew, WhatsNewService } from '../../services/whats-new.service';

describe('WhatsNewModal', () => {
  const pending = signal<WhatsNew | null>(null);
  const dismiss = vi.fn(() => Promise.resolve());

  function montar() {
    dismiss.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: WhatsNewService, useValue: { pending, dismiss } }] });
    const fixture = TestBed.createComponent(WhatsNewModal);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const news = (hasMore = false): WhatsNew => ({
    hasMore,
    releases: [
      { id: 1, version: '2.30.0', releasedAt: new Date('2026-10-28T12:00:00Z'), title: 'Algo nuevo', summary: 'Técnico', userSummary: 'Para la gente', changes: ['a', 'b', 'c', 'd', 'e'], isPublished: true },
      { id: 2, version: '2.29.0', releasedAt: new Date('2026-10-20T12:00:00Z'), title: 'Otro', summary: 'Solo el técnico', changes: [], isPublished: true },
    ],
  });

  beforeEach(() => pending.set(null));

  it('sin novedades no pinta nada', () => {
    expect(montar().el.querySelector('.wn')).toBeNull();
  });

  it('usa el resumen para el usuario y, si falta, el resumen normal', () => {
    pending.set(news());
    const { el } = montar();
    const resumenes = Array.from(el.querySelectorAll('.wn__summary')).map((p) => p.textContent?.trim());

    expect(resumenes).toEqual(['Para la gente', 'Solo el técnico']);
  });

  it('enseña como mucho 4 puntos por versión', () => {
    pending.set(news());
    expect(montar().el.querySelectorAll('.wn__item')[0].querySelectorAll('.wn__changes li').length).toBe(4);
  });

  it('"Ver todas las novedades" solo sale si hay más', () => {
    pending.set(news(false));
    expect(montar().el.querySelector('.wn__all')).toBeNull();
    TestBed.resetTestingModule();
    pending.set(news(true));
    expect(montar().el.querySelector('.wn__all')?.getAttribute('href')).toBe('/novedades');
  });

  it('"Entendido", Escape y tocar fuera la cierran', () => {
    pending.set(news());
    const { fixture, el } = montar();

    el.querySelector<HTMLButtonElement>('.wn__ok')!.click();
    expect(dismiss).toHaveBeenCalledTimes(1);

    fixture.componentInstance.onEscape();
    expect(dismiss).toHaveBeenCalledTimes(2);

    el.querySelector<HTMLElement>('.wn__backdrop')!.click();
    expect(dismiss).toHaveBeenCalledTimes(3);
  });

  it('tocar dentro de la modal no la cierra', () => {
    pending.set(news());
    const { el } = montar();
    el.querySelector<HTMLElement>('.wn')!.click();
    expect(dismiss).not.toHaveBeenCalled();
  });
});
