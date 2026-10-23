import { ServiceModel } from './service.model';

/**
 * @deprecated Usa `ServiceModel` (`shared/models/service.model.ts`). Es el
 * subconjunto que usaban las cuatro tarjetas de antes de la fase 5; se conserva como
 * alias para no romper imports y se retira en la fase 7.
 */
export type ServiciosCardModel = Pick<ServiceModel, 'id' | 'icon' | 'title' | 'description'>;
