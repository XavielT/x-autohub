import { AvailabilityRule, Blackout, ServiceModel, ServiceWorkModel } from '../models/service.model';

/**
 * El catálogo de servicios del modo simulado: **los mismos diez que siembra la
 * migración 0019**, con los mismos ids (1 a 10) y slugs. Las piezas instalables del
 * mock de la tienda apuntan a estos ids.
 *
 * Los precios: la base real los deja **nulos** ("a cotizar") hasta que el taller los
 * ponga. Aquí hay algunos para que las pantallas ejerciten las dos formas
 * ("Desde RD$ X" y "A cotizar") sin conectar nada. Son datos de desarrollo, no una
 * lista de precios.
 */
const svc = (
  id: number,
  slug: string,
  title: string,
  icon: string,
  description: string,
  category: ServiceModel['category'],
  durationMinutes: number,
  priceFrom: number | null,
  longDescription: string,
): ServiceModel => ({
  id,
  slug,
  title,
  icon: `assets/icons/${icon}.svg`,
  description,
  longDescription,
  category,
  priceFrom,
  durationMinutes,
  isBookable: true,
  images: [],
  sortOrder: id * 10,
  isActive: true,
});

export const SERVICES_MOCK: ServiceModel[] = [
  svc(1, 'instalacion-de-accesorios', 'Instalación de accesorios', 'mechanic-tools-hub-icon',
    'Te instalamos lo que compraste en la tienda.', 'instalacion', 60, null,
    'Instalamos en el taller los accesorios y piezas que compres con nosotros: alfombras, luces, audio, sensores, protecciones y más. Trae tu vehículo con la pieza o compra la pieza en la tienda y marca "Quiero que me la instalen". El precio depende de la pieza y del vehículo: te lo confirmamos antes de empezar.'),
  svc(2, 'cambio-de-aceite-y-filtros', 'Cambio de aceite y filtros', 'maintenance-hub-icon',
    'Aceite y filtros al día, con el producto correcto para tu motor.', 'mantenimiento', 45, 1500,
    'Cambio de aceite de motor y de los filtros de aceite, aire y combustible según lo que pida tu vehículo. Si traes tu propio aceite, dínoslo al agendar. El precio depende del tipo de aceite y del motor: te lo confirmamos antes de empezar.'),
  svc(3, 'mantenimiento-por-kilometraje', 'Mantenimiento por kilometraje', 'maintenance-hub-icon',
    'El servicio que le toca a tu vehículo según su kilometraje.', 'mantenimiento', 120, null,
    'Revisamos tu vehículo y hacemos el mantenimiento que le toca por kilometraje: fluidos, filtros, correas y revisión general. Dinos el kilometraje y el modelo al agendar y armamos la lista. Te confirmamos el precio antes de empezar.'),
  svc(4, 'frenos', 'Frenos', 'repair-hub-icon',
    'Revisión y cambio de pastillas, discos y líquido.', 'mecanica', 90, 2500,
    'Revisión del sistema de frenos y cambio de pastillas, discos o líquido cuando hace falta. Si sientes vibración, ruido o el pedal blando, agéndalo cuanto antes. Te decimos qué encontramos y qué cuesta antes de cambiar nada.'),
  svc(5, 'suspension', 'Suspensión', 'repair-hub-icon',
    'Amortiguadores, bujes y rótulas: revisión y cambio.', 'mecanica', 120, null,
    'Revisión de la suspensión y cambio de amortiguadores, bujes, rótulas y terminales. Si el carro rebota, golpea en los huecos o se va hacia un lado, empieza por aquí. Te confirmamos el diagnóstico y el precio antes de empezar.'),
  svc(6, 'bateria-y-alternador', 'Batería y alternador', 'diagnostic-hub-icon',
    'Prueba y cambio de batería, y revisión del alternador.', 'electrico', 45, 800,
    'Probamos la batería y el sistema de carga, y la cambiamos si hace falta. Si tu carro no prende o se apaga con las luces puestas, tráelo. Puedes comprar la batería en la tienda y que te la instalemos.'),
  svc(7, 'luces-y-electrico', 'Luces y eléctrico', 'diagnostic-hub-icon',
    'Luces, fusibles, cableado y fallas eléctricas.', 'electrico', 60, null,
    'Cambio de bombillos y kits LED, y diagnóstico de fusibles, relés y cableado. Describe la falla al agendar: un diagnóstico eléctrico lleva tiempo y te confirmamos el precio cuando sepamos qué es.'),
  svc(8, 'carga-y-reparacion-de-aire-acondicionado', 'Carga y reparación de A/C', 'services-hub-icon',
    'Si tu aire no enfría, lo revisamos.', 'aire_acondicionado', 90, null,
    'Revisión del aire acondicionado, búsqueda de fugas y carga de gas. Si enfría poco o hace ruido, agéndalo. El precio depende de si es solo carga o hay una pieza que cambiar: te lo confirmamos antes de empezar.'),
  svc(9, 'diagnostico-computarizado', 'Diagnóstico computarizado', 'medical-scanner-hub-icon',
    'Escáner para leer qué le pasa a tu vehículo.', 'diagnostico', 60, 1200,
    'Conectamos el escáner, leemos los códigos de falla y te explicamos qué significan y qué conviene hacer. Si se prendió la luz del motor, empieza por aquí. Te damos el resultado por escrito.'),
  svc(10, 'revision-pre-compra', 'Revisión pre-compra', 'search-check-hub-icon',
    'Te acompañamos a revisar el carro antes de que lo compres.', 'diagnostico', 90, null,
    'Antes de pagar un vehículo usado, lo revisamos: motor, transmisión visible, frenos, suspensión, eléctrico y escáner. Te decimos qué encontramos y si vale lo que piden. Dinos marca, modelo y año al agendar.'),
];

/**
 * El horario de ejemplo de la migración 0019: lunes a viernes 8:00–17:00 y sábado
 * 8:00–13:00, franjas de 60 minutos, 2 citas simultáneas.
 */
export const AVAILABILITY_MOCK: AvailabilityRule[] = [1, 2, 3, 4, 5, 6].map((weekday, i) => ({
  id: i + 1,
  weekday,
  opensAt: '08:00',
  closesAt: weekday === 6 ? '13:00' : '17:00',
  slotMinutes: 60,
  capacity: 2,
  isExample: true,
}));

export const BLACKOUTS_MOCK: Blackout[] = [];

/**
 * Dos trabajos de ejemplo para ver la galería. **TODO: fotos reales.** Las imágenes
 * son las de piezas de la tienda, que son lo único que hay en `assets/`: no son un
 * antes y un después de verdad. La base real no trae ninguno: la sección no se
 * pinta hasta que el taller publique el primero.
 */
export const WORKS_MOCK: ServiceWorkModel[] = [
  {
    id: 1,
    serviceId: 4,
    title: 'Cambio de discos y pastillas',
    description: 'Discos ventilados nuevos y pastillas cerámicas, con sangrado del sistema.',
    beforeImage: 'assets/imgs/hub-parts/pastillas-ceramicas-sport.jpg',
    afterImage: 'assets/imgs/hub-parts/disco-brembo-gtr.jpg',
    vehicleText: 'Toyota Corolla 2015',
    doneAt: new Date('2026-09-12T12:00:00'),
    isPublished: true,
  },
  {
    id: 2,
    serviceId: 6,
    title: 'Batería nueva',
    description: 'Prueba del alternador y cambio de batería AGM.',
    beforeImage: null,
    afterImage: 'assets/imgs/hub-parts/bateria-agm-70ah.jpg',
    vehicleText: 'Honda Civic 2018',
    doneAt: new Date('2026-10-02T12:00:00'),
    isPublished: true,
  },
];
