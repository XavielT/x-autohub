import { NewsScope } from '../../core/supabase/database.types';

/**
 * Vistas reducidas del inventario propio para el panel.
 *
 * A propósito no son los modelos completos (`HubPartModel`, `AutoHubModel`): el
 * listado de administración solo necesita identificar cada fila y los campos que
 * se ajustan a diario. Traer las 17 columnas de un vehículo para pintar una
 * tabla sería gastar ancho de banda en datos que nadie mira.
 */
export interface AdminPartModel {
  id: number;
  name: string;
  brand: string;
  category: string;
  price: number;
  stock: number;
  isActive: boolean;
}

export interface AdminVehicleModel {
  id: number;
  brand: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  isAvailable: boolean;
}

export interface AdminNewsModel {
  id: number;
  title: string;
  scope: NewsScope;
  publishedAt: Date;
  isPublished: boolean;
}
