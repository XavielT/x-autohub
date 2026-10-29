import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ReleaseModel } from '../../../shared/models/release.model';
import { ReleaseService } from '../../../shared/services/release.service';
import { SeoService } from '../../../shared/services/seo.service';

import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
/**
 * /novedades — el historial completo de versiones publicadas, para cualquiera.
 * (Hasta ahora solo existía en /admin/versiones.) Cada versión dice su resumen para
 * el usuario y sus cambios.
 */
@Component({
  selector: 'app-novedades',
  imports: [Skeleton, DatePipe],
  templateUrl: './novedades.html',
  styleUrl: './novedades.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Novedades implements OnInit {
  private readonly releasesService = inject(ReleaseService);
  private readonly seo = inject(SeoService);

  readonly releases = signal<ReleaseModel[]>([]);
  readonly isLoading = signal(true);
  readonly hasError = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.seo.reset());
  }

  ngOnInit(): void {
    this.seo.set({
      title: 'Novedades | X AutoHub',
      description: 'Lo nuevo de X AutoHub: cada versión del sitio, con lo que trae.',
      path: '/novedades',
    });
    this.releasesService.getAll(false).subscribe({
      next: (items) => {
        this.releases.set(items);
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }
}
