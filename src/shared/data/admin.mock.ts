import { AdminOrderModel } from '../models/admin-order.model';
import { AdminUserModel } from '../models/release.model';
import {
  AdminNewsModel,
  AdminPartModel,
  AdminVehicleModel,
} from '../models/admin-inventory.model';

/**
 * Contenido del panel para cuando la app corre sin Supabase.
 *
 * Sirve para trabajar la interfaz sin credenciales, igual que el resto de los
 * mocks. Los correos son de ejemplo a propósito: no son de nadie.
 */
export const ADMIN_USERS_MOCK: AdminUserModel[] = [
  {
    id: 'mock-admin',
    displayName: 'Xaviel Terrero',
    email: 'admin@ejemplo.com',
    phone: '809-000-0001',
    location: 'Santo Domingo',
    role: 'admin',
    isAdmin: true,
    isVerified: true,
    isTestUser: false,
    createdAt: new Date('2026-07-06T10:00:00Z'),
  },
  {
    id: 'mock-user-1',
    displayName: 'Ana Perez',
    email: 'ana@ejemplo.com',
    location: 'Santiago',
    // Moderadora: es la cuenta con la que se prueba la cola de revision.
    role: 'moderador',
    isAdmin: false,
    isVerified: true,
    isTestUser: false,
    createdAt: new Date('2026-08-01T14:30:00Z'),
  },
  {
    id: 'mock-user-2',
    displayName: 'Luis Mendez',
    email: 'luis@ejemplo.com',
    phone: '809-000-0002',
    location: 'La Romana',
    role: 'user',
    isAdmin: false,
    isVerified: false,
    // Cuenta de prueba: ve el contenido marcado como `isTest`. No es un rol —
    // sigue siendo `user`. En modo simulado la sesion equivalente se abre con
    // prueba@… o test@… (ver AuthService).
    isTestUser: true,
    createdAt: new Date('2026-08-10T09:15:00Z'),
  },
];

/**
 * Cuatro pedidos que cubren lo que el panel tiene que saber manejar: uno por
 * transferencia **con comprobante** esperando que lo confirmen, uno por WhatsApp
 * sin pagar, uno ya pagado que sale por envío y uno de retiro que se está
 * preparando.
 */
export const ADMIN_ORDERS_MOCK: AdminOrderModel[] = [
  {
    id: 'mock-order-1',
    orderNumber: 1004,
    fulfillmentType: 'shipping',
    province: 'Distrito Nacional',
    proofPath: 'mock-order-1/comprobante.jpg',
    paymentConfirmedAt: null,
    whatsappOpenedAt: null,
    wantsInstallation: true,
    history: [
      { fromStatus: null, toStatus: 'awaiting_payment', note: null, createdAt: new Date('2026-08-13T18:40:00Z') },
    ],
    contactEmail: 'ana@ejemplo.com',
    contactPhone: '8095550003',
    fullName: 'Ana Perez',
    addressLine1: 'Av. 27 de Febrero 120',
    city: 'Santo Domingo',
    shippingOptionId: 'standard',
    paymentMethodId: 'transfer',
    subtotal: 15800,
    shippingPrice: 0,
    total: 15800,
    status: 'awaiting_payment',
    isGuest: false,
    createdAt: new Date('2026-08-13T18:40:00Z'),
    items: [
      { id: 1, name: 'Disco ventilado GTR 355mm', unitPrice: 12950, quantity: 1 },
      { id: 2, name: 'Filtro de aire de alto flujo', unitPrice: 2850, quantity: 1 },
    ],
  },
  {
    id: 'mock-order-2',
    orderNumber: 1003,
    fulfillmentType: 'shipping',
    province: 'Santiago',
    proofPath: 'mock-order-2/comprobante.pdf',
    paymentConfirmedAt: new Date('2026-08-12T12:00:00Z'),
    whatsappOpenedAt: null,
    wantsInstallation: false,
    history: [
      { fromStatus: null, toStatus: 'awaiting_payment', note: null, createdAt: new Date('2026-08-12T11:05:00Z') },
      { fromStatus: 'awaiting_payment', toStatus: 'paid', note: 'Transferencia verificada', createdAt: new Date('2026-08-12T12:00:00Z') },
    ],
    contactEmail: 'invitado@ejemplo.com',
    contactPhone: '8295550004',
    fullName: 'Cliente Invitado',
    addressLine1: 'Calle Duarte 10',
    city: 'Santiago',
    shippingOptionId: 'express',
    paymentMethodId: 'transfer',
    subtotal: 2850,
    shippingPrice: 450,
    total: 3300,
    status: 'paid',
    isGuest: true,
    createdAt: new Date('2026-08-12T11:05:00Z'),
    items: [{ id: 3, name: 'Filtro de aire de alto flujo', unitPrice: 2850, quantity: 1 }],
  },
  {
    id: 'mock-order-3',
    orderNumber: 1002,
    fulfillmentType: 'pickup',
    proofPath: null,
    paymentConfirmedAt: new Date('2026-08-11T10:00:00Z'),
    whatsappOpenedAt: new Date('2026-08-11T09:31:00Z'),
    wantsInstallation: false,
    history: [
      { fromStatus: null, toStatus: 'awaiting_payment', note: null, createdAt: new Date('2026-08-11T09:30:00Z') },
      { fromStatus: 'awaiting_payment', toStatus: 'paid', note: 'Pago acordado por WhatsApp', createdAt: new Date('2026-08-11T10:00:00Z') },
      { fromStatus: 'paid', toStatus: 'preparing', note: null, createdAt: new Date('2026-08-11T10:05:00Z') },
    ],
    contactEmail: 'luis@ejemplo.com',
    contactPhone: '8495550005',
    fullName: 'Luis Martinez',
    addressLine1: 'Retiro en el taller',
    shippingOptionId: 'pickup',
    paymentMethodId: 'whatsapp',
    subtotal: 3300,
    shippingPrice: 0,
    total: 3300,
    status: 'preparing',
    isGuest: false,
    createdAt: new Date('2026-08-11T09:30:00Z'),
    items: [{ id: 4, name: 'Alfombras all-weather', unitPrice: 3300, quantity: 1 }],
  },
  {
    id: 'mock-order-4',
    orderNumber: 1001,
    fulfillmentType: 'shipping',
    province: 'La Vega',
    proofPath: null,
    paymentConfirmedAt: null,
    whatsappOpenedAt: new Date('2026-08-10T08:01:00Z'),
    wantsInstallation: false,
    history: [
      { fromStatus: null, toStatus: 'awaiting_payment', note: null, createdAt: new Date('2026-08-10T08:00:00Z') },
    ],
    contactEmail: 'maria@ejemplo.com',
    contactPhone: '8095550006',
    fullName: 'Maria Rodriguez',
    addressLine1: 'Calle Mella 45',
    city: 'La Vega',
    shippingOptionId: 'standard',
    paymentMethodId: 'whatsapp',
    subtotal: 2250,
    shippingPrice: 0,
    total: 2250,
    status: 'awaiting_payment',
    isGuest: false,
    createdAt: new Date('2026-08-10T08:00:00Z'),
    items: [{ id: 5, name: 'Aceite sintetico 5W-30 5L', unitPrice: 2250, quantity: 1 }],
  },
];

export const ADMIN_PARTS_MOCK: AdminPartModel[] = [
  { id: 1, name: 'Disco ventilado GTR 355mm', brand: 'Brembo', categoryId: 6, sku: 'XAH-000001', fulfillment: 'stock', price: 12950, stock: 8, isActive: true, isTest: false },
  { id: 2, name: 'Filtro de aire de alto flujo', brand: 'K&N', categoryId: 8, sku: 'XAH-000002', fulfillment: 'stock', price: 2850, stock: 24, isActive: true, isTest: false },
  { id: 3, name: 'Kit Coilover Street Pro', brand: 'BC Racing', categoryId: 7, sku: 'XAH-000003', fulfillment: 'on_order', price: 32500, stock: 3, isActive: true, isTest: false },
  { id: 4, name: 'Aceite sintetico 5W-30 5L', brand: 'Motul', categoryId: 8, sku: 'XAH-000004', fulfillment: 'stock', price: 2250, stock: 0, isActive: false, isTest: false },
  // Mismo id que la pieza de prueba de HUB_PART_MOCK, para que marcar y
  // desmarcar desde el panel se corresponda con lo que se ve en el catalogo.
  { id: 36, name: 'PRUEBA - Pieza de prueba', brand: 'X AutoHub', categoryId: 12, sku: 'XAH-000036', fulfillment: 'stock', price: 100, stock: 5, isActive: true, isTest: true },
];

export const ADMIN_VEHICLES_MOCK: AdminVehicleModel[] = [
  { id: 1, brand: 'Toyota', model: 'Corolla', year: 2020, price: 985000, mileage: 42000, isAvailable: true, isTest: false },
  { id: 2, brand: 'Honda', model: 'CR-V', year: 2019, price: 1290000, mileage: 58000, isAvailable: true, isTest: false },
  { id: 6, brand: 'PRUEBA', model: 'Vehiculo de prueba', year: 2020, price: 100, mileage: 1000, isAvailable: true, isTest: true },
];

export const ADMIN_NEWS_MOCK: AdminNewsModel[] = [
  { id: 1, title: '809 Expo por primera vez en RD', scope: 'local', publishedAt: new Date('2026-08-01T12:00:00Z'), isPublished: true, isTest: false },
  { id: 2, title: 'Primer Mercedes Benz completamente electrico', scope: 'internacional', publishedAt: new Date('2026-07-20T12:00:00Z'), isPublished: true, isTest: false },
  { id: 3, title: 'PRUEBA - Noticia de prueba', scope: 'local', publishedAt: new Date('2026-08-15T12:00:00Z'), isPublished: true, isTest: true },
];
