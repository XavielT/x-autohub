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

  // El aviso de "confirma tu correo" reemplaza al formulario: es el resultado
  // de la pagina, no un mensaje al margen. Ver la BITACORA del 27/08/2026.
  it('cambia el formulario por el aviso de confirmacion', async () => {
    const fixture = TestBed.createComponent(Registro);
    await fixture.whenStable();

    fixture.componentInstance.confirmationEmail.set('tecnologia@constructorasd.com');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Cuenta creada');
    expect(text).toContain('tecnologia@constructorasd.com');
    expect(text).toContain('spam');
    // El formulario ya no esta: no hay donde volver a enviar.
    expect((fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();
  });
});
