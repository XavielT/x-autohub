import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ServiciosCard } from '../../../shared/components/servicios-card/servicios-card';
import { ServiciosCardModel } from '../../../shared/models/servicios-card.model';
import { ServiciosCardService } from '../../../shared/services/servicios-card.service';

@Component({
  selector: 'app-servicios',
  imports: [ServiciosCard],
  templateUrl: './servicios.html',
  styleUrl: './servicios.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Servicios implements OnInit {
  private readonly serviciosCardService = inject(ServiciosCardService);

  readonly servicios = signal<ServiciosCardModel[]>([]);

  ngOnInit(): void {
    this.serviciosCardService.getServicios().subscribe((servicios) =>
      this.servicios.set(servicios),
    );
  }
}
