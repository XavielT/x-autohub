import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { FavoriteButton } from './favorite-button';
import { FavoriteService } from '../../services/favorite.service';
import { of } from 'rxjs';

describe('FavoriteButton', () => {
  function montar(guardado: boolean) {
    const ids = signal<readonly number[]>(guardado ? [7] : []);
    const toggle = vi.fn(() => of(true));
    TestBed.configureTestingModule({ providers: [{ provide: FavoriteService, useValue: { ids, toggle } }] });
    const fixture = TestBed.createComponent(FavoriteButton);
    fixture.componentRef.setInput('partId', 7);
    fixture.componentRef.setInput('label', 'Filtro de aceite');
    fixture.detectChanges();
    const boton = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    return { fixture, boton, toggle, ids };
  }

  it('no guardado: ofrece guardar, con aria-pressed false', () => {
    const { boton } = montar(false);
    expect(boton.getAttribute('aria-label')).toBe('Guardar Filtro de aceite en favoritos');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
    expect(boton.classList.contains('is-saved')).toBe(false);
  });

  it('guardado: ofrece quitar, con aria-pressed true', () => {
    const { boton } = montar(true);
    expect(boton.getAttribute('aria-label')).toBe('Quitar Filtro de aceite de favoritos');
    expect(boton.getAttribute('aria-pressed')).toBe('true');
    expect(boton.classList.contains('is-saved')).toBe(true);
  });

  it('tocarlo llama a toggle sin dejar que el toque abra la tarjeta', () => {
    const { boton, toggle } = montar(false);
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true });
    boton.dispatchEvent(evento);
    expect(toggle).toHaveBeenCalledWith(7);
    expect(evento.defaultPrevented).toBe(true);
  });
});
