import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HubPartModel } from '../../models/hub-part.model';

@Component({
  selector: 'app-catalogo-card',
  imports: [RouterLink],
  templateUrl: './catalogo-card.html',
  styleUrl: './catalogo-card.scss',
})
export class CatalogoCard {
  @Input({required:true}) hubPart!: HubPartModel;
}
