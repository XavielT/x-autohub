import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { BumpOnChange } from './bump-on-change';

@Component({ imports: [BumpOnChange], template: '<span [xahBump]="n()">{{ n() }}</span>' })
class Host {
  readonly n = signal(1);
}

describe('BumpOnChange', () => {
  it('anima cuando el valor cambia, no en la primera lectura', async () => {
    const fixture = TestBed.createComponent(Host);
    const span = fixture.nativeElement.querySelector('span') as HTMLElement;
    const animate = vi.fn();
    span.animate = animate as unknown as typeof span.animate;

    fixture.detectChanges();
    expect(animate).not.toHaveBeenCalled();

    fixture.componentInstance.n.set(2);
    fixture.detectChanges();
    expect(animate).toHaveBeenCalledTimes(1);
  });
});
