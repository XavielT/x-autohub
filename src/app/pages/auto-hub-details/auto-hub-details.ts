import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { AutoHubModel } from '../../../shared/models/auto-hub.model';
import { AutoHubService } from '../../../shared/services/auto-hub.service';

@Component({
  selector: 'app-auto-hub-details',
  imports: [DecimalPipe, SlicePipe],
  templateUrl: './auto-hub-details.html',
  styleUrl: './auto-hub-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoHubDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly autoHubService = inject(AutoHubService);

  readonly auto = signal<AutoHubModel | undefined>(undefined);
  readonly images = signal<string[]>([]);
  readonly currentImageIndex = signal(0);
  readonly isLoading = signal(true);

  readonly isDescriptionExpanded = signal(false);
  readonly maxDescriptionLength = 200;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.isLoading.set(true);
      this.currentImageIndex.set(0);

      this.autoHubService.getById(id).subscribe({
        next: (auto) => {
          this.auto.set(auto);
          this.images.set(auto?.images ?? []);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
    });
  }

  selectImage(index: number): void {
    this.currentImageIndex.set(index);
  }

  prevImage(): void {
    const total = this.images().length;
    if (total <= 1) return;
    this.currentImageIndex.update((i) => (i - 1 + total) % total);
  }

  nextImage(): void {
    const total = this.images().length;
    if (total <= 1) return;
    this.currentImageIndex.update((i) => (i + 1) % total);
  }

  toggleDescription(): void {
    this.isDescriptionExpanded.update((expanded) => !expanded);
  }
}
