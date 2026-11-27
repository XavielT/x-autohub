import { TestBed } from '@angular/core/testing';

import { PasswordToggle } from './password-toggle';

describe('PasswordToggle', () => {
  it('alterna el campo entre password y text', () => {
    const input = document.createElement('input');
    input.id = 'pw-test';
    input.type = 'password';
    document.body.appendChild(input);

    const fixture = TestBed.createComponent(PasswordToggle);
    fixture.componentRef.setInput('for', 'pw-test');
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('Mostrar la contraseña');

    btn.click();
    fixture.detectChanges();
    expect(input.type).toBe('text');
    expect(btn.getAttribute('aria-label')).toBe('Ocultar la contraseña');

    btn.click();
    expect(input.type).toBe('password');
    input.remove();
  });
});
