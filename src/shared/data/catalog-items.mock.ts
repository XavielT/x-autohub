import { CatalogItem } from "../models/catalog-item.model";

export const CATALOG_ITEMS_MOCK: CatalogItem[] = [
    {
        id: 1,
        category: 'EXTERIOR & INTERIOR',
        title: 'ACCESORIOS',
        imageUrl: 'assets/imgs/catalog/accesorios.jpg',
        ctaLabel: 'VER TODOS',
        ctaLink: '/catalog/accesorios',
        variant: 'featured',
    },
    {
        id: 2,
        category: 'AROS',
        title: 'AROS RACING',
        imageUrl: 'assets/imgs/catalog/wheel.jpg',
        variant: 'secondary',
    },
    {
        id: 3,
        category: 'MOTOR',
        title: 'BUJIAS / FILTROS / ...',
        imageUrl: 'assets/imgs/catalog/motor.jpg',
        variant: 'secondary',
    },
    {
        id: 4,
        category: 'SUSPENSION',
        title: 'SUSPENSION KITS',
        imageUrl: 'assets/imgs/catalog/suspension.jpg',
        variant: 'secondary-wide',
    },
]