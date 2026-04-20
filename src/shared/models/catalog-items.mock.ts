import { CatalogItem } from "./catalog-item.model";

export const CATALOG_ITEMS_MOCK: CatalogItem[] = [
    {
        id: 1,
        category: 'SISTEMAS DE INDUCCION',
        title: 'TURBOS',
        imageUrl: 'assets/imgs/catalog/turbo.png',
        ctaLabel: 'VER TODOS',
        ctaLink: '/catalog/turbos',
        variant: 'featured',
    },
    {
        id: 2,
        category: 'AROS',
        title: 'AROS RACING',
        imageUrl: 'assets/imgs/catalog/wheel.png',
        variant: 'secondary',
    },
    {
        id: 3,
        category: 'MOTOR',
        title: 'SISTEMAS DE ESCAPE',
        imageUrl: 'assets/imgs/catalog/motor.png',
        variant: 'secondary',
    },
    {
        id: 4,
        category: 'SUSPENSION',
        title: 'SUSPENSION KITS',
        imageUrl: 'assets/imgs/catalog/suspension.png',
        variant: 'secondary-wide',
    },
]