import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ServiceModel } from '../models/service.model';
import { ServiceCatalogService } from './service-catalog.service';

/**
 * @deprecated Usa `ServiceCatalogService`. Con la fase 5 los servicios dejaron de ser
 * cuatro tarjetas y el servicio se movió; este queda como fachada para no romper a
 * quien todavía lo inyecta (el banner del home, el selector de instalación del panel).
 * Se retira en la fase 7. No tiene lógica propia.
 */
@Injectable({ providedIn: 'root' })
export class ServiciosCardService {
  private readonly catalog = inject(ServiceCatalogService);

  getServicios(): Observable<ServiceModel[]> {
    return this.catalog.getServices();
  }
}
