import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '../core/guards/auth.guard';
import { adminGuard } from '../core/guards/admin.guard';
import { moderatorGuard } from '../core/guards/moderator.guard';

const BRAND = 'X AutoHub';

/**
 * Cada ruta se carga con `loadComponent` para que su código salga del bundle
 * inicial: el usuario solo descarga la página que visita.
 *
 * `title` alimenta la etiqueta <title> del documento (Angular la aplica solo);
 * es lo que se ve en la pestaña y lo que indexan los buscadores.
 */
export const routes: Routes = [
  {
    path: '',
    title: `${BRAND} — El hub central de los autos en RD`,
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },

  // --- Auto Hub: inventario propio, verificado por X AutoHub ---
  {
    path: 'auto-hub',
    title: `Auto Hub — Vehiculos verificados | ${BRAND}`,
    loadComponent: () => import('./pages/auto-hub/auto-hub').then((m) => m.AutoHub),
  },
  {
    path: 'auto-hub-details/:id',
    title: `Detalle del vehiculo | ${BRAND}`,
    loadComponent: () =>
      import('./pages/auto-hub-details/auto-hub-details').then((m) => m.AutoHubDetails),
  },

  // --- Catalogo: tienda propia de piezas (carrito + checkout) ---
  {
    path: 'catalogo',
    title: `Catalogo de piezas | ${BRAND}`,
    loadComponent: () => import('./pages/catalogo/catalogo').then((m) => m.Catalogo),
  },
  {
    path: 'hub-part-details/:id',
    title: `Detalle de la pieza | ${BRAND}`,
    loadComponent: () =>
      import('./pages/hub-part-details/hub-part-details').then((m) => m.HubPartDetails),
  },
  {
    path: 'checkout',
    title: `Checkout | ${BRAND}`,
    loadComponent: () => import('./pages/checkout/checkout').then((m) => m.Checkout),
  },

  // --- Hub Market: publicaciones de la comunidad ---
  {
    path: 'hub-market',
    title: `Hub Market — Compra y vende | ${BRAND}`,
    loadComponent: () => import('./pages/hub-market/hub-market').then((m) => m.HubMarket),
  },
  {
    path: 'car-details/:id',
    title: `Detalle del vehiculo | ${BRAND}`,
    loadComponent: () => import('./pages/car-details/car-details').then((m) => m.CarDetails),
  },
  {
    path: 'hub-market-part-details/:id',
    title: `Detalle de la pieza | ${BRAND}`,
    loadComponent: () =>
      import('./pages/hub-market-part-details/hub-market-part-details').then(
        (m) => m.HubMarketPartDetails,
      ),
  },
  {
    path: 'accessory-details/:id',
    title: `Detalle del accesorio | ${BRAND}`,
    loadComponent: () =>
      import('./pages/accessory-details/accessory-details').then((m) => m.AccessoryDetails),
  },
  {
    path: 'publicar',
    title: `Publicar en Hub Market | ${BRAND}`,
    // Publicar requiere sesion: la publicacion queda asociada a un vendedor.
    canActivate: [authGuard],
    loadComponent: () => import('./pages/publicar/publicar').then((m) => m.Publicar),
  },

  // --- Servicios y comunidad ---
  {
    path: 'servicios',
    title: `Servicios de taller | ${BRAND}`,
    loadComponent: () => import('./pages/servicios/servicios').then((m) => m.Servicios),
  },
  {
    path: 'social-hub',
    title: `Social Hub — Clubes y eventos | ${BRAND}`,
    loadComponent: () => import('./pages/social-hub/social-hub').then((m) => m.SocialHub),
  },
  {
    path: 'news/:id',
    title: `Noticia | ${BRAND}`,
    loadComponent: () => import('./pages/new-details/new-details').then((m) => m.NewDetails),
  },

  // --- Cuenta ---
  {
    path: 'login',
    title: `Iniciar sesion | ${BRAND}`,
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'registro',
    title: `Crear cuenta | ${BRAND}`,
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/registro/registro').then((m) => m.Registro),
  },

  {
    path: 'perfil',
    title: `Mi perfil | ${BRAND}`,
    canActivate: [authGuard],
    loadComponent: () => import('./pages/perfil/perfil').then((m) => m.Perfil),
  },

  // --- Administracion ---
  //
  // El padre usa `moderatorGuard` y **cada seccion de admin se protege por su
  // cuenta** con `adminGuard`. Se afloja arriba para que el moderador entre al
  // marco del panel, y se cierra abajo para que solo abra `moderacion`.
  //
  // Si agregas una seccion nueva, ponle su `canActivate`: sin el, el guard del
  // padre la deja abierta a los moderadores. Es el error que cubre la prueba de
  // `app.routes.spec.ts`.
  //
  // Los guards son comodidad de interfaz: la seguridad real esta en RLS y en las
  // funciones de las migraciones 0007, 0011 y 0012, que vuelven a comprobar el
  // rol dentro de Postgres.
  {
    path: 'admin',
    title: `Administracion | ${BRAND}`,
    canActivate: [moderatorGuard],
    loadComponent: () => import('./pages/admin/admin').then((m) => m.Admin),
    children: [
      // Antes caia en 'versiones', que un moderador no puede abrir: al entrar a
      // /admin lo habria rebotado a la raiz con un error. 'moderacion' la abren
      // los dos roles, asi que sirve de aterrizaje comun.
      { path: '', pathMatch: 'full', redirectTo: 'moderacion' },
      {
        path: 'moderacion',
        title: `Moderacion | ${BRAND}`,
        canActivate: [moderatorGuard],
        loadComponent: () =>
          import('./pages/admin/moderacion/admin-moderacion').then((m) => m.AdminModeracion),
      },
      {
        path: 'versiones',
        title: `Versiones | ${BRAND}`,
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/versiones/admin-versiones').then((m) => m.AdminVersiones),
      },
      {
        path: 'pedidos',
        title: `Pedidos | ${BRAND}`,
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/pedidos/admin-pedidos').then((m) => m.AdminPedidos),
      },
      {
        path: 'inventario',
        title: `Inventario | ${BRAND}`,
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/inventario/admin-inventario').then((m) => m.AdminInventario),
      },
      {
        path: 'usuarios',
        title: `Usuarios | ${BRAND}`,
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/usuarios/admin-usuarios').then((m) => m.AdminUsuarios),
      },
      {
        path: 'ajustes',
        title: `Ajustes | ${BRAND}`,
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/ajustes/admin-ajustes').then((m) => m.AdminAjustes),
      },
    ],
  },

  // --- Legal ---
  {
    path: 'terminos-condiciones',
    title: `Terminos y condiciones | ${BRAND}`,
    loadComponent: () =>
      import('./pages/terminos-condiciones/terminos-condiciones').then((m) => m.TerminosCondiciones),
  },

  // Debe quedar de ultimo: captura cualquier URL que no coincida arriba.
  {
    path: '**',
    title: `Pagina no encontrada | ${BRAND}`,
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
  },
];
