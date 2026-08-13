import { TestBed } from '@angular/core/testing';

import { Registro } from './registro';

describe('Registro', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Registro],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(Registro);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('flags mismatched passwords at group level', async () => {
    const fixture = TestBed.createComponent(Registro);
    await fixture.whenStable();

    fixture.componentInstance.form.setValue({
      displayName: 'Xaviel',
      email: 'test@correo.com',
      phone: '',
      location: '',
      password: 'secreta1',
      confirmPassword: 'secreta2',
    });

    expect(fixture.componentInstance.form.hasError('passwordMismatch')).toBe(true);
  });

  it('accepts a form where both passwords match', async () => {
    const fixture = TestBed.createComponent(Registro);
    await fixture.whenStable();

    fixture.componentInstance.form.setValue({
      displayName: 'Xaviel',
      email: 'test@correo.com',
      phone: '',
      location: '',
      password: 'secreta1',
      confirmPassword: 'secreta1',
    });

    expect(fixture.componentInstance.form.valid).toBe(true);
  });
});
