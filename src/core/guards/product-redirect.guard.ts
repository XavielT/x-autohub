import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ProductService } from '../../shared/services/product.service';

/**
 * `/hub-part-details/:id` → `/tienda/p/:slug`.
 *
 * La ficha de producto antigua se llegó a enlazar desde fuera (búsquedas,
 * mensajes de WhatsApp, favoritos del navegador), y la nueva se identifica por el
 * slug. Esta ruta se queda **solo para redirigir**: resuelve el id y manda a la
 * ficha nueva. Si el producto ya no existe va a la tienda, que es mejor que una
 * página de error para quien llegó con un enlace viejo.
 */
export const productIdRedirectGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const id = Number(route.paramMap.get('id'));

  try {
    const product = Number.isInteger(id) ? await firstValueFrom(inject(ProductService).getById(id)) : undefined;
    return router.createUrlTree(product ? ['/tienda', 'p', product.slug] : ['/tienda']);
  } catch {
    return router.createUrlTree(['/tienda']);
  }
};
