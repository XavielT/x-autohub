import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Distintivo "PRUEBA" del contenido marcado como de prueba (fase 6).
 *
 * Se dibuja **sin condición propia**: quien lo llama ya decidió que hay algo que
 * marcar (`@if (item().isTest)`). Y llegar a verlo significa que la sesión tiene
 * permiso, porque un artículo de prueba no le llega a nadie más — lo esconde RLS
 * en modo real y el predicado de `shared/utils/test-visibility.ts` en el
 * simulado. No hay estado en el que un visitante normal lo vea.
 *
 * Es un componente propio y no `app-info-badge` por dos razones concretas:
 * ese badge sale en color de marca y con `text-transform: capitalize`, así que
 * mostraría "Prueba" con el mismo aspecto que el "Local / Internacional" de las
 * noticias —dos cosas distintas indistinguibles— y aquí el punto es justo que
 * cante. Este va en rojo, en mayúsculas y con borde.
 */
@Component({
  selector: 'app-test-badge',
  imports: [],
  templateUrl: './test-badge.html',
  styleUrl: './test-badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestBadge {}
