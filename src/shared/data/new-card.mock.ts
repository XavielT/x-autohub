import { NewCardModel } from "../models/new-card.model";

export const NEWS_MOCK: NewCardModel[] = [
    {
        id: 1,
        imageUrl: 'assets/imgs/news/expo-809.jpg',
        location: 'local',
        date: new Date('2026-04-15'),
        title: '809 Expo por primera vez en RD 🇩🇴',
        text: 'Evento con Car Show, Drift exhibition y entretenimiento en vivo. Con los mejores pilotos y proyectos de US y RD.',
        // TODO: add expo-809-2 / expo-809-3 to assets/imgs/news and list them here.
        images: ['assets/imgs/news/expo-809.jpg'],
        textLarge: 'Por primera ves en Republica Dominicana. @809expo Presentado por 100X35 Expo y Clean Culture, traen AutoShow / Drift / Caribbean Culture en un evento con @adam_lz y amigos. El evento tendra lugar en el Autodromo de las Americas este Domingo 7 de Junio de 2026. Sera una experiencia de dia completo con seccion de Car Show, seccion de Drift, Vendor midway, entretenimiento en vivo y la premiacion de los mejores carros del evento. Podras registrar tu vehiculo para el evento proximamente en: cleancultureevents.com',
    },
    {
        id: 2,
        imageUrl: 'assets/imgs/news/electric-mercedes.png',
        location: 'internacional',
        date: new Date('2026-04-18'),
        title: 'Primer Mercedes Benz completamente electrico',
        text: 'Mercedes ha lanzado su primer modelo totalmente electrico, el Mercedes C-Class. Un sedan con las ultimas tecnologias y comfort.',
        // TODO: add electric-mercedes-2 / -3 to assets/imgs/news and list them here.
        images: ['assets/imgs/news/electric-mercedes.png'],
        textLarge: 'Así que, ¡que empiece el juego! Después de que BMW nos impresionara a todos con su revolucionario iX3, elegido Coche del Año por TG, y lo complementara con el magnífico sedán i3, Mercedes ha contraatacado: tras el GLC Electric llega este, el primer Mercedes-Benz Clase C totalmente eléctrico. Y el dato más destacado para muchos será su autonomía, porque… aún se queda corta en comparación con BMW. Mercedes anuncia hasta 760 kilómetros (473 millas) con una sola carga de su batería de 94 kWh, que, como bien saben los entusiastas de los coches eléctricos, es más pequeña que la batería que Múnich ha instalado en el i3. ¿Y para el resto de ustedes? Su aspecto. Este Clase C eléctrico incorpora la última versión del lenguaje de diseño de Mercedes, y la marca afirma que su "silueta de coupé" y su "expresivo diseño trasero GT" dan como resultado una "elegancia con un carisma impresionante".',
    },
    // Noticia de prueba (fase 6). Solo la ven admin, moderador y usuarios de
    // prueba; para el resto no existe, ni en el home ni por URL directa.
    {
        id: 3,
        imageUrl: 'assets/imgs/news/expo-809.jpg',
        location: 'local',
        date: new Date('2026-08-15'),
        title: 'PRUEBA - Noticia de prueba',
        text: 'Noticia de prueba del equipo de X AutoHub. No es contenido real.',
        images: ['assets/imgs/news/expo-809.jpg'],
        textLarge: 'Noticia de prueba del equipo de X AutoHub. Sirve para verificar la portada, la galeria y la pagina de detalle sin publicar nada al publico. No es contenido real.',
        isTest: true,
    },
]