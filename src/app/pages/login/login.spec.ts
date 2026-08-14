import { TestBed } from '@angular/core/testing';

import { Login, safeReturnUrl } from './login';
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

/**
 * `returnUrl` llega por la barra de direcciones, así que es entrada del usuario.
 * Sin filtrar convierte el login en una redirección abierta: un enlace
 * `/login?returnUrl=//sitio-falso.com` deja el dominio real en la barra hasta
 * que el usuario entra, y ahí lo manda a otro sitio.
 */
describe('safeReturnUrl', () => {
  it('acepta una ruta interna', () => {
    expect(safeReturnUrl('/publicar')).toBe('/publicar');
    expect(safeReturnUrl('/catalogo?categoria=frenos')).toBe('/catalogo?categoria=frenos');
  });

  it('rechaza otro dominio', () => {
    expect(safeReturnUrl('https://sitio-falso.com')).toBe('/');
    expect(safeReturnUrl('http://sitio-falso.com')).toBe('/');
  });

  it('rechaza la forma //host, que el navegador trata como otro dominio', () => {
    expect(safeReturnUrl('//sitio-falso.com')).toBe('/');
    expect(safeReturnUrl('//sitio-falso.com/publicar')).toBe('/');
  });

  it('rechaza javascript: y otros esquemas', () => {
    expect(safeReturnUrl('javascript:alert(1)')).toBe('/');
    expect(safeReturnUrl('data:text/html,<script>alert(1)</script>')).toBe('/');
  });

  it('cae a la raiz cuando no hay valor', () => {
    expect(safeReturnUrl(null)).toBe('/');
    expect(safeReturnUrl('')).toBe('/');
  });
});
