/** Las tres vistas del Social Hub. */
export type SocialHubTab = 'feed' | 'clubes' | 'eventos';

/** Publicación de un miembro de la comunidad. */
export interface SocialPostModel {
  id: number;
  authorName: string;
  /** Club o taller al que pertenece el autor, si aplica. */
  authorClub?: string;
  /** Miembro verificado por X AutoHub. */
  isVerified?: boolean;
  createdAt: string;
  text: string;
  imageUrl?: string;
  /** Etiquetas sin el '#'. */
  tags: string[];
  likes: number;
  comments: number;
}

/** Club o crew registrado en la plataforma. */
export interface SocialClubModel {
  id: number;
  name: string;
  location: string;
  members: number;
  /** Enfoque del club: JDM, offroad, clásicos, etc. */
  focus: string;
  description: string;
  imageUrl?: string;
  isOfficial?: boolean;
}

/** Evento de la escena: car show, drift day, caravana. */
export interface SocialEventModel {
  id: number;
  title: string;
  /** ISO date. */
  date: string;
  location: string;
  organizer: string;
  description: string;
  imageUrl?: string;
  /** Cupos ya confirmados. */
  attendees: number;
  /** RD$ por persona. 0 = gratis. */
  price: number;
}
