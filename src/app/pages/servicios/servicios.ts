import { Component, OnInit } from '@angular/core';
import { ServiciosCard } from '../../../shared/components/servicios-card/servicios-card';
import { ServiciosCardModel } from '../../../shared/models/servicios-card.model';
import { ServiciosCardService } from '../../../shared/services/servicios-card.service';

@Component({
  selector: 'app-servicios',
  imports: [ServiciosCard],
  templateUrl: './servicios.html',
  styleUrl: './servicios.scss',
})
export class Servicios  implements OnInit{

  servicios: ServiciosCardModel [] =[];

  constructor(private serviciosCardService: ServiciosCardService) {}

  ngOnInit(): void {
    this.servicios = this.serviciosCardService.getServicios();
  }

}
