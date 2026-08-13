import { TestBed } from '@angular/core/testing';

import { Login } from './login';
import { AuthService } from '../../../shared/services/auth.service';

describe('Login', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Login],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('does not log in from an empty form', async () => {
    const fixture = TestBed.createComponent(Login);
    const auth = TestBed.inject(AuthService);
    await fixture.whenStable();

    fixture.componentInstance.onSubmit();

    expect(fixture.componentInstance.form.invalid).toBe(true);
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('rejects a password shorter than 6 characters', async () => {
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();

    fixture.componentInstance.form.setValue({ email: 'test@correo.com', password: '123' });

    expect(fixture.componentInstance.form.controls.password.invalid).toBe(true);
  });
});
