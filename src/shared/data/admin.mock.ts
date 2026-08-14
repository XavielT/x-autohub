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
    isAdmin: true,
    isVerified: true,
    createdAt: new Date('2026-07-06T10:00:00Z'),
  },
  {
    id: 'mock-user-1',
    displayName: 'Ana Perez',
    email: 'ana@ejemplo.com',
    location: 'Santiago',
    isAdmin: false,
    isVerified: true,
    createdAt: new Date('2026-08-01T14:30:00Z'),
  },
  {
    id: 'mock-user-2',
    displayName: 'Luis Mendez',
    email: 'luis@ejemplo.com',
    phone: '809-000-0002',
    location: 'La Romana',
    isAdmin: false,
    isVerified: false,
    createdAt: new Date('2026-08-10T09:15:00Z'),
  },
];

export const ADMIN_ORDERS_MOCK: AdminOrderModel[] = [
  {
    id: 'mock-order-1',
    contactEmail: 'ana@ejemplo.com',
    contactPhone: '809-000-0003',
    fullName: 'Ana Perez',
    addressLine1: 'Av. 27 de Febrero 120',
    city: 'Santo Domingo',
    shippingOptionId: 'standard',
    paymentMethodId: 'card',
    subtotal: 15800,
    shippingPrice: 0,
    total: 15800,
    status: 'pending',
    isGuest: false,
    createdAt: new Date('2026-08-13T18:40:00Z'),
    items: [
      { id: 1, name: 'Disco ventilado GTR 355mm', unitPrice: 12950, quantity: 1 },
      { id: 2, name: 'Filtro de aire de alto flujo', unitPrice: 2850, quantity: 1 },
    ],
  },
  {
    id: 'mock-order-2',
    contactEmail: 'invitado@ejemplo.com',
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
];

export const ADMIN_PARTS_MOCK: AdminPartModel[] = [
  { id: 1, name: 'Disco ventilado GTR 355mm', brand: 'Brembo', category: 'Frenos', price: 12950, stock: 8, isActive: true },
  { id: 2, name: 'Filtro de aire de alto flujo', brand: 'K&N', category: 'Filtros', price: 2850, stock: 24, isActive: true },
  { id: 3, name: 'Kit Coilover Street Pro', brand: 'BC Racing', category: 'Suspension y Chassis', price: 32500, stock: 3, isActive: true },
  { id: 4, name: 'Aceite sintetico 5W-30 5L', brand: 'Motul', category: 'Aceites', price: 2250, stock: 0, isActive: false },
];

export const ADMIN_VEHICLES_MOCK: AdminVehicleModel[] = [
  { id: 1, brand: 'Toyota', model: 'Corolla', year: 2020, price: 985000, mileage: 42000, isAvailable: true },
  { id: 2, brand: 'Honda', model: 'CR-V', year: 2019, price: 1290000, mileage: 58000, isAvailable: true },
];

export const ADMIN_NEWS_MOCK: AdminNewsModel[] = [
  { id: 1, title: '809 Expo por primera vez en RD', scope: 'local', publishedAt: new Date('2026-08-01T12:00:00Z'), isPublished: true },
  { id: 2, title: 'Primer Mercedes Benz completamente electrico', scope: 'internacional', publishedAt: new Date('2026-07-20T12:00:00Z'), isPublished: true },
];
