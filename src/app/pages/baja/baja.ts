import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EmailSubscriptionService } from '../../../shared/services/email-subscription.service';

type Estado = 'confirmar' | 'saliendo' | 'listo' | 'invalido' | 'error';

/**
 * Baja del Club X AutoHub. Pública: se llega desde el enlace del correo, casi
 * siempre sin sesión.
 *
 * **Pide confirmación, no da de baja al cargar.** Es la decisión que importa de
 * esta pantalla: los clientes de correo y los antivirus **abren los enlaces por
 * su cuenta** para previsualizarlos y comprobarlos, así que una baja al cargar
 * sacaría de la lista a gente que nunca hizo clic — y encima sin que se enteren.
 * Con un botón de por medio, un prefetch no borra nada.
 *
 * Por eso mismo el correo anuncia el enlace con `List-Unsubscribe` a secas y no
 * con `List-Unsubscribe-Post` (RFC 8058): esa cabecera le promete al cliente de
 * correo que puede dar de baja con un POST sin preguntar, y aquí hay una
 * pregunta.
 *
 * El token se lee con `ActivatedRoute`, como las demás páginas con parámetro.
 * Pasar los parámetros como `input()` es el punto 11 del ROADMAP y hace falta
 * `withComponentInputBinding()`, que hoy no está puesto — con `input()` el token
 * llegaría siempre vacío y la pantalla diría "enlace inválido" a todo el mundo.
 */
@Component({
  selector: 'app-baja',
  imports: [RouterLink],
  templateUrl: './baja.html',
  styleUrl: './baja.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Baja implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly subscriptions = inject(EmailSubscriptionService);

  readonly estado = signal<Estado>('confirmar');

  private token = '';

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.token = params.get('token') ?? '';
      this.estado.set(this.token ? 'confirmar' : 'invalido');
    });
  }

  confirmar(): void {
    if (!this.token) {
      this.estado.set('invalido');
      return;
    }

    this.estado.set('saliendo');

    this.subscriptions.unsubscribe(this.token).subscribe({
      // `false` = ese token no corresponde a nadie. Pasa al abrir dos veces el
      // mismo enlace, y no es un error: es "ya no estás en la lista".
      next: (salio) => this.estado.set(salio ? 'listo' : 'invalido'),
      error: (err: unknown) => {
        this.estado.set('error');
        console.error(err);
      },
    });
  }
}
