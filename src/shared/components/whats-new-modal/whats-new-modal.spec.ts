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
      { id: 1, version: '2.30.0', releasedAt: new Date('2026-10-28T12:00:00Z'), title: 'Algo nuevo', summary: 'Técnico', userSummary: 'Para la gente', changes: ['Migración 0099 y a', 'b'], isPublished: true },
      { id: 2, version: '2.29.0', releasedAt: new Date('2026-10-20T12:00:00Z'), title: 'Otro', summary: 'Solo el técnico', userSummary: 'Otro para la gente', changes: [], isPublished: true },
    ],
  });

  beforeEach(() => pending.set(null));

  it('sin novedades no pinta nada', () => {
    expect(montar().el.querySelector('.wn')).toBeNull();
  });

  it('enseña el resumen para el usuario', () => {
    pending.set(news());
    const { el } = montar();
    const resumenes = Array.from(el.querySelectorAll('.wn__summary')).map((p) => p.textContent?.trim());

    expect(resumenes).toEqual(['Para la gente', 'Otro para la gente']);
  });

  it('nunca enseña el resumen técnico ni los puntos del changelog', () => {
    pending.set(news());
    const { el } = montar();

    expect(el.querySelector('.wn__changes')).toBeNull();
    expect(el.textContent).not.toContain('Técnico');
    expect(el.textContent).not.toContain('migración');
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
