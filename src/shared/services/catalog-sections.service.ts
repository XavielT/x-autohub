import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CatalogItem } from '../models/catalog-item.model';
import { CATALOG_ITEMS_MOCK } from '../data/catalog-items.mock';

/**
 * Las tarjetas de categoría del home (Accesorios, Aros, Motor, Suspensión).
 *
 * No hay tabla en Supabase para esto a propósito: son mobiliario de la página
 * (imagen + copy + a qué filtro del catálogo llevan), no datos del negocio. Si
 * algún día se quieren editar sin desplegar, se crea la tabla y solo cambia
 * este servicio.
 *
 * Existe como servicio, y no como import directo del mock, para que ningún
 * componente tenga que conocer un archivo `.mock.ts`.
 */
@Injectable({ providedIn: 'root' })
export class CatalogSectionsService {
  getSections(): Observable<CatalogItem[]> {
    return of(CATALOG_ITEMS_MOCK);
  }
}
