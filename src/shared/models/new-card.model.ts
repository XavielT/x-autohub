export type NewCardLocation = 'internacional' | 'local';

export interface NewCardModel {
    id: number;
    imageUrl: string;
    location: NewCardLocation;
    date: Date;
    title: string;
    text: string;

    //extra data to use in new-details
    images: string[];
    textLarge: string;
    author?: string;
    /** Noticia de prueba. Ver `shared/utils/test-visibility.ts`. */
    isTest?: boolean;
}