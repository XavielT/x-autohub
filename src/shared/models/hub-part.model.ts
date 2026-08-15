export interface HubPartModel {
    id: number;
    category: string;
    imgUrl: string;
    images?: string[];
    name: string;
    brand: string;
    starsRating: number;
    price: number;
    description: string;
    /** Artículo de prueba. Ver `shared/utils/test-visibility.ts`. */
    isTest?: boolean;
}