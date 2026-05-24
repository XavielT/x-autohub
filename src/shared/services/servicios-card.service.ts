import { Injectable } from "@angular/core";
import { ServiciosCardModel } from "../models/servicios-card.model";
import { SERVICIOS_CARD_MOCK } from "../models/servicios-card.mock";

@Injectable({
    providedIn: 'root'
})

export class ServiciosCardService {
    getServicios(): ServiciosCardModel[]{
        return SERVICIOS_CARD_MOCK;
    }
}