export type HubMarketCategory = 'vehiculos' | 'piezas' | 'accesorios';

export interface HubMarketItemModel {
  id: number;
  title: string;
  description: string;
  image: string;
  images?: string[];
  price: number;
  location: string;
  sellerName: string;
  category: HubMarketCategory;
  isFeatured?: boolean;
  detailRoute?: string;
  createdAt?: string;
  condition?: 'new' | 'used';
  vehicleSpecs?: {
    year: number;
    mileage: number;
    hp?: number;
    zeroTo100?: number;
    topSpeed?: number;
    brand?: string;
    model?: string;
  };
}
