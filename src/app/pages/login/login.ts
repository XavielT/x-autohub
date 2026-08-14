import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LogoHub } from '../../../shared/components/logo-hub/logo-hub';
import { AuthService } from '../../../shared/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { RequiredField, focusFirstInvalid } from '../../../shared/forms/required-fields';

/**
 * Acota `returnUrl` a una ruta interna.
 *
 * Viene de la barra de direcciones, así que es entrada del usuario: sin filtrar,
 * un enlace como `/login?returnUrl=//sitio-falso.com` convierte el login en un
 * trampolín hacia otro dominio (redirección abierta), que es justo lo que se
 * usa para montar una pantalla de login falsa creíble.
 *
 * Solo se acepta una ruta que empiece con una sola `/`. Eso descarta
 * `//host`, `https://host` y `javascript:`.
 */
export function safeReturnUrl(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, LogoHub],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');

  /**
   * Con Supabase conectado el login es real, así que el aviso de "autenticacion
   * de demostracion" mentiría. Solo se muestra cuando la app corre con mocks.
   */
  readonly isDemoMode = inject(SupabaseService).shouldUseMockData();

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  /** Solo se muestra el error cuando el campo ya fue tocado. */
  showError(field: 'email' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  /** Los dos obligatorios, para llevar el foco al primero que falte. */
  private requiredFields(): RequiredField[] {
    const c = this.form.controls;
    return [
      { key: 'email', label: 'Correo', invalid: c.email.invalid },
      { key: 'password', label: 'Contrasena', invalid: c.password.invalid },
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

    this.auth.login(this.form.getRawValue()).subscribe({
      next: (user) => {
        this.isSubmitting.set(false);
        this.toast.show(`Bienvenido de vuelta, ${user.displayName}`);
        // Vuelve a donde el usuario quería ir antes de que el guard lo desviara.
        const returnUrl = new URLSearchParams(window.location.search).get('returnUrl');
        void this.router.navigateByUrl(safeReturnUrl(returnUrl));
      },
      error: (error: Error) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(error.message || 'No pudimos iniciar tu sesion.');
      },
    });
  }
}
