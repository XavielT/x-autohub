import { TestBed } from '@angular/core/testing';
import { UpdateToast } from './update-toast';
import { PwaUpdateService } from '../../services/pwa-update.service';

describe('UpdateToast', () => {
  function montar() {
    const apply = vi.fn().mockResolvedValue(undefined);
    const service = TestBed.inject(PwaUpdateService);
    service.apply = apply;
    const fixture = TestBed.createComponent(UpdateToast);
    return { fixture, service, apply, el: fixture.nativeElement as HTMLElement };
  }

  it('no se ve mientras no haya versión nueva', () => {
    const { fixture, el } = montar();
    fixture.detectChanges();

    expect(el.querySelector('.ut')).toBeNull();
  });

  it('con una versión lista dice "Hay una versión nueva · Actualizar"', () => {
    const { fixture, service, el } = montar();
    service.updateReady.set(true);
    fixture.detectChanges();

    expect(el.textContent).toContain('Hay una versión nueva');
    expect(el.querySelector('.ut__btn')?.textContent).toContain('Actualizar');
  });

  it('Actualizar llama a apply()', () => {
    const { fixture, service, apply, el } = montar();
    service.updateReady.set(true);
    fixture.detectChanges();

    (el.querySelector('.ut__btn') as HTMLButtonElement).click();

    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('"Más tarde" lo esconde', () => {
    const { fixture, service, el } = montar();
    service.updateReady.set(true);
    fixture.detectChanges();

    (el.querySelector('.ut__close') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('.ut')).toBeNull();
  });
});
