import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HubPartModel } from '../models/hub-part.model';
import { ProductService } from './product.service';

/**
 * @deprecated Usa `ProductService`. Con el pivote de octubre de 2026 la tienda
 * dejó de ser "el catálogo de piezas" y el servicio se movió; este queda como
 * una fachada para no romper a quien todavía lo inyecta (el carrito, las páginas
 * del catálogo). Se retira en la fase 7.
 *
 * No tiene lógica propia: todo lo resuelve `ProductService`, incluida la
 * visibilidad del contenido de prueba.
 */
@Injectable({ providedIn: 'root' })
export class HubPartService {
  private readonly products = inject(ProductService);

  getAll(): Observable<HubPartModel[]> {
    return this.products.getAll();
  }

  getById(id: number): Observable<HubPartModel | undefined> {
    return this.products.getById(id);
  }

  getByCategory(category: string): Observable<HubPartModel[]> {
    return this.products.getByCategory(category);
  }
}
