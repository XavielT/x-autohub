import { HubMarketItemModel } from '../models/hub-market-item.model';

export const HUB_MARKET_ITEMS_MOCK: HubMarketItemModel[] = [
  {
    id: 101,
    title: 'Toyota Supra MK4',
    description: '2JZ armado, interior restaurado y listo para calle/pista. Incluye sistema de escape deportivo, frenos mejorados y un historial de mantenimiento completo. El auto ha sido pulido recientemente, con pintura en impecable estado y detalles interiores renovados para ofrecer una experiencia de conducción tanto para uso diario como para eventos. Se entrega con documentación al día y una inspección mecánica reciente que certifica el excelente estado de todos sus componentes.',
    images:['assets/imgs/supra-white.webp','assets/imgs/supra-mk4-2.webp', 'assets/imgs/supra-mk4-3.webp'],
    price: 130000,
    location: 'Santo Domingo',
    sellerName: 'Juan M.',
    contactPhone: '8095550134',
    category: 'vehiculos',
    isFeatured: true,
    detailRoute: '/car-details/101',
    createdAt: '2026-04-12',
    vehicleSpecs: {
      year: 1994,
      mileage: 180000,
      hp: 873,
      zeroTo100: 3.8,
      topSpeed: 350,
      brand: 'Toyota',
      model: 'Supra'
    }
  },
  {
    id: 102,
    title: 'Volkswagen Golf MK4',
    description: 'Project car con upgrades de suspensión y frenos.',
    images: ['assets/imgs/vw-golf-mk4.webp'],
    price: 8000,
    location: 'Santiago',
    sellerName: 'AutoHub Garage',
    category: 'vehiculos',
    isFeatured: true,
    detailRoute: '/car-details/102',
    createdAt: '2026-04-08',
    vehicleSpecs: {
      year: 2003,
      mileage: 210000,
      hp: 325,
      zeroTo100: 10.0,
      topSpeed: 220,
      brand: 'Volkswagen',
      model: 'Golf'
    }
  },
  {
    id: 103,
    title: 'Citroen C3',
    description: 'Uso diario, mantenimiento al dia y pintura reciente.',
    images: ['assets/imgs/citroen-c3.jpg'],
    price: 5000,
    location: 'La Romana',
    sellerName: 'Carlos R.',
    category: 'vehiculos',
    isFeatured: true,
    detailRoute: '/car-details/103',
    createdAt: '2026-04-01',
    vehicleSpecs: {
      year: 2003,
      mileage: 185000,
      hp: 110,
      zeroTo100: 14.9,
      topSpeed: 180,
      brand: 'Citroen',
      model: 'C3'
    }
  },
  {
    id: 201,
    title: 'Discos Brembo GTR',
    description: 'Set de discos ventilados, poco uso y sin alabeo.',
    images: ['assets/imgs/hub-parts/disco-brembo-gtr-2.jpg'],
    price: 600,
    location: 'Santo Domingo',
    sellerName: 'Racing Parts RD',
    contactPhone: '8295550187',
    category: 'piezas',
    detailRoute: '/hub-part-details/9',
    createdAt: '2026-04-18'
  },
  {
    id: 202,
    title: 'Disco Brembo GTR (Unidad)',
    description: 'Unidad individual, ideal para reemplazo rapido.',
    images: ['assets/imgs/hub-parts/disco-brembo-gtr-3.jpg'],
    price: 180,
    location: 'Bani',
    sellerName: 'Miguel P.',
    category: 'piezas',
    detailRoute: '/hub-part-details/10',
    createdAt: '2026-04-10'
  },
  {
    id: 301,
    title: 'Pack accesorios interior',
    description: 'Kit de accesorios universales para interior deportivo.',
    images: ['assets/imgs/catalog/accesorios.jpg'],
    price: 120,
    location: 'San Cristobal',
    sellerName: 'Accesorios Hub',
    contactPhone: '8495550142',
    category: 'accesorios',
    createdAt: '2026-03-29'
  },
  {
    id: 104,
    title: 'Volkswagen Amarok',
    description: 'Uso diario, mantenimiento al dia y pintura reciente.',
    images: ['assets/imgs/amarok.jpeg'],
    price: 847000,
    location: 'Neiba',
    sellerName: 'Jose T.',
    category: 'vehiculos',
    isFeatured: true,
    detailRoute: '/car-details/201',
    createdAt: '2026-05-20',
    vehicleSpecs: {
      year: 2018,
      mileage: 97000,
      hp: 220,
      zeroTo100: 11.3,
      topSpeed: 240,
      brand: 'Volkswagen',
      model: 'Amarok',
    }
  },
  // Publicacion de prueba (fase 6). Aprobada y activa: si no fuera de prueba se
  // veria en Hub Market como cualquier otra. Solo la ven admin, moderador y
  // usuarios de prueba. Ver shared/utils/test-visibility.ts.
  {
    id: 105,
    title: 'PRUEBA - Publicacion de prueba',
    description: 'Publicacion de prueba del equipo de X AutoHub. No esta a la venta.',
    images: ['assets/imgs/catalog/accesorios.jpg'],
    price: 100,
    location: 'Santo Domingo',
    sellerName: 'X AutoHub',
    contactPhone: '8099539782',
    category: 'accesorios',
    status: 'aprobado',
    isTest: true,
    detailRoute: '/accessory-details/105',
    createdAt: '2026-08-15',
  },
];
