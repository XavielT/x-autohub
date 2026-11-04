import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Digest, DigestService, renderDigest } from '../../../../shared/services/digest.service';
import { ToastService } from '../../../../shared/services/toast.service';

/**
 * "Hoy en el negocio": la tarjeta de arriba de /admin con el resumen de la mañana (migración 0056), más el historial. Los números salen de la base; la IA solo
 * redacta y ordena "lo primero que haría hoy" (máximo 3, con enlace). Si la IA no estaba, el resumen es una plantilla con los mismos números, y la tarjeta lo dice.
 * Solo se ve para admins (el marco del panel la pinta dentro de `isAdmin()`).
 */
@Component({
  selector: 'app-admin-hoy',
  imports: [DatePipe, RouterLink],
  templateUrl: './admin-hoy.html',
  styleUrl: './admin-hoy.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHoy implements OnInit {
  private readonly digests = inject(DigestService);
  private readonly toast = inject(ToastService);

  readonly list = signal<Digest[]>([]);
  readonly loaded = signal(false);
  readonly isGenerating = signal(false);
  readonly showHistory = signal(false);
  readonly selectedId = signal<number | null>(null);

  /** El que se está leyendo: el elegido del historial o el más reciente. */
  readonly current = computed<Digest | null>(() => this.list().find((d) => d.id === this.selectedId()) ?? this.list()[0] ?? null);
  readonly lines = computed(() => {
    const d = this.current();
    return d ? renderDigest(d.body) : [];
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.digests.getRecent().subscribe({
      next: (list) => {
        this.list.set(list);
        this.loaded.set(true);
      },
      // Sin permiso o sin red la tarjeta simplemente no dice nada.
      error: () => this.loaded.set(true),
    });
  }

  generate(): void {
    if (this.isGenerating()) return;
    this.isGenerating.set(true);
    this.digests.generateNow().subscribe((ok) => {
      this.isGenerating.set(false);
      if (!ok) return void this.toast.show('No pudimos generar el resumen ahora.', 'error');
      this.selectedId.set(null);
      this.load();
    });
  }

  toggleHistory(): void {
    this.showHistory.update((v) => !v);
  }

  open(d: Digest): void {
    this.selectedId.set(d.id);
  }
}
