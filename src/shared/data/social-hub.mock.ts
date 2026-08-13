import { SocialClubModel, SocialEventModel, SocialPostModel } from '../models/social-hub.model';

/**
 * Contenido de muestra del Social Hub.
 *
 * Reutiliza imágenes que ya viven en assets: no se agregan archivos nuevos por
 * contenido de demostración.
 */
export const SOCIAL_POSTS_MOCK: SocialPostModel[] = [
  {
    id: 1,
    authorName: 'Juan M.',
    authorClub: 'Supra Club RD',
    isVerified: true,
    createdAt: '2026-08-09T18:30:00',
    text: 'Terminamos el armado del 2JZ despues de tres meses. Suena mejor de lo que esperaba. Gracias a todos los que ayudaron con las piezas.',
    imageUrl: 'assets/imgs/supra-white.webp',
    tags: ['2JZ', 'Supra', 'BuildLog'],
    likes: 184,
    comments: 32,
  },
  {
    id: 2,
    authorName: 'AutoHub Garage',
    isVerified: true,
    createdAt: '2026-08-08T14:05:00',
    text: 'Recordatorio: los coilovers Street Pro que estaban agotados ya volvieron al catalogo. Instalacion incluida esta semana.',
    imageUrl: 'assets/imgs/hub-parts/coilover-street-pro.jpg',
    tags: ['Suspension', 'Catalogo'],
    likes: 96,
    comments: 11,
  },
  {
    id: 3,
    authorName: 'Carlos R.',
    authorClub: 'Citroen Crew',
    createdAt: '2026-08-07T09:20:00',
    text: 'Mi C3 cumplio 20 anos rodando y sigue firme. Mantenimiento al dia y cero problemas. Los clasicos economicos tambien cuentan.',
    imageUrl: 'assets/imgs/citroen-c3.jpg',
    tags: ['Citroen', 'DailyDriver'],
    likes: 61,
    comments: 8,
  },
  {
    id: 4,
    authorName: 'Laura P.',
    authorClub: 'MK4 Crew',
    createdAt: '2026-08-05T20:45:00',
    text: 'Buscando quien haya hecho el swap de frenos delanteros en un Golf MK4. Quiero saber que kit usaron antes de comprar.',
    imageUrl: 'assets/imgs/vw-golf-mk4.webp',
    tags: ['Golf', 'Frenos', 'Ayuda'],
    likes: 43,
    comments: 27,
  },
];

export const SOCIAL_CLUBS_MOCK: SocialClubModel[] = [
  {
    id: 1,
    name: 'Supra Club RD',
    location: 'Santo Domingo',
    members: 312,
    focus: 'JDM / Performance',
    description:
      'Duenos y fanaticos de la Supra en Republica Dominicana. Meets mensuales y compras grupales de piezas.',
    imageUrl: 'assets/imgs/supra-mk4-2.webp',
    isOfficial: true,
  },
  {
    id: 2,
    name: 'MK4 Crew',
    location: 'Santiago',
    members: 178,
    focus: 'Volkswagen / Project cars',
    description:
      'Todo lo relacionado con la plataforma MK4. Asesoria entre miembros, herramientas compartidas y caravanas.',
    imageUrl: 'assets/imgs/vw-golf-mk4.webp',
  },
  {
    id: 3,
    name: 'Citroen Crew',
    location: 'Distrito Nacional',
    members: 94,
    focus: 'Europeos / Daily drivers',
    description:
      'Comunidad enfocada en mantener europeos economicos rodando. Piezas usadas verificadas y talleres de confianza.',
    imageUrl: 'assets/imgs/auto-hub/c3.jpeg',
  },
  {
    id: 4,
    name: 'Offroad 809',
    location: 'La Vega',
    members: 205,
    focus: 'Pickups / 4x4',
    description:
      'Rutas de fin de semana, montaje de barras LED y suspension elevada. Se recorre el pais completo.',
    imageUrl: 'assets/imgs/auto-hub/amarok.jpeg',
  },
];

export const SOCIAL_EVENTS_MOCK: SocialEventModel[] = [
  {
    id: 1,
    title: '809 Expo — Car Show & Drift',
    date: '2026-09-07',
    location: 'Autodromo de las Americas',
    organizer: '100X35 Expo / Clean Culture',
    description:
      'Car show, exhibicion de drift, vendor midway y premiacion de los mejores proyectos del pais.',
    imageUrl: 'assets/imgs/news/expo-809.jpg',
    attendees: 1240,
    price: 1500,
  },
  {
    id: 2,
    title: 'Caravana Hub — Ruta Sur',
    date: '2026-09-21',
    location: 'Salida desde Santo Domingo',
    organizer: 'X AutoHub',
    description:
      'Caravana abierta hasta Barahona. Punto de encuentro a las 6:00 AM, desayuno y paradas fotograficas.',
    imageUrl: 'assets/imgs/auto-hub/tiguan.jpeg',
    attendees: 86,
    price: 0,
  },
  {
    id: 3,
    title: 'Track Day — Novatos',
    date: '2026-10-05',
    location: 'Autodromo de las Americas',
    organizer: 'X AutoHub / Supra Club RD',
    description:
      'Sesion guiada para quienes nunca han pisado pista. Incluye inspeccion tecnica previa e instructor.',
    imageUrl: 'assets/imgs/supra-mk4-3.webp',
    attendees: 48,
    price: 3500,
  },
];
