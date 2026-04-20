export type CatalogCardVariant = 'featured' | 'secondary' | 'secondary-wide';

export interface CatalogItem {
    id: number;
    category: string;
    title: string;
    imageUrl: string;
    ctaLabel?: string;
    ctaLink?: string;
    variant: CatalogCardVariant;
}