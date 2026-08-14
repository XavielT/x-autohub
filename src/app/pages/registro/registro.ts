import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LogoHub } from '../../../shared/components/logo-hub/logo-hub';
import { AuthService } from '../../../shared/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { RequiredField, focusFirstInvalid } from '../../../shared/forms/required-fields';
import { LocationSelect } from '../../../shared/ui/location-select/location-select';

/** Valida a nivel de grupo que las dos contrasenas coincidan. */
function passwordsMatch(group: AbstractControl) {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password && confirm && password !== confirm ? { passwordMismatch: true } : null;
}

type RegistroField = 'displayName' | 'email' | 'phone' | 'location' | 'password' | 'confirmPassword';

@Component({
  selector: 'app-registro',
  imports: [ReactiveFormsModule, RouterLink, LogoHub, LocationSelect],
  templateUrl: './registro.html',
  styleUrl: './registro.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Registro {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * Con Supabase conectado la cuenta se crea de verdad, así que el aviso de que
   * "los datos se guardan solo en este navegador" sería falso.
   */
  readonly isDemoMode = inject(SupabaseService).shouldUseMockData();

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');

  readonly form = this.fb.nonNullable.group(
    {
      displayName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      location: [''],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  showError(field: RegistroField): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  get showMismatch(): boolean {
    const confirm = this.form.controls.confirmPassword;
    return this.form.hasError('passwordMismatch') && (confirm.touched || confirm.dirty);
  }

  /**
   * Los obligatorios en el orden de la pantalla, para llevar el foco al primero
   * que falte. Telefono y ciudad quedan fuera: son opcionales.
   *
   * No cambia ningún validador ni ningún mensaje: los errores por campo ya
   * existían aquí, esto solo decide a cuál saltar.
   */
  private requiredFields(): RequiredField[] {
    const c = this.form.controls;
    return [
      { key: 'displayName', label: 'Nombre', invalid: c.displayName.invalid },
      { key: 'email', label: 'Correo', invalid: c.email.invalid },
      { key: 'password', label: 'Contrasena', invalid: c.password.invalid },
      {
        key: 'confirmPassword',
        label: 'Confirmar contrasena',
        invalid: c.confirmPassword.invalid || this.form.hasError('passwordMismatch'),
      },
    ];
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement, this.requiredFields());
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    const { displayName, email, password, phone, location } = this.form.getRawValue();

    this.auth
      .register({
        displayName,
        email,
        password,
        phone: phone || undefined,
        location: location || undefined,
      })
      .subscribe({
        next: (user) => {
          this.isSubmitting.set(false);
          this.toast.show(`Cuenta creada. Bienvenido, ${user.displayName}`);
          // Al perfil y no a la portada: recién creada la cuenta, lo útil es ver
          // y completar los propios datos. El `returnUrl` del login no se toca.
          void this.router.navigateByUrl('/perfil');
        },
        error: (error: Error) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(error.message || 'No pudimos crear tu cuenta.');
        },
      });
  }
}
