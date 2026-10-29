import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '../core/guards/auth.guard';
import { adminGuard } from '../core/guards/admin.guard';
import { moderatorGuard } from '../core/guards/moderator.guard';
import { productIdRedirectGuard } from '../core/guards/product-redirect.guard';

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
    title: `${BRAND} — Todo lo que tu carro necesita`,
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },

  // --- Auto Hub: inventario propio, verificado por X AutoHub ---
  {
    path: 'auto-hub',
    title: `Auto Hub — Vehículos verificados | ${BRAND}`,
    loadComponent: () => import('./pages/auto-hub/auto-hub').then((m) => m.AutoHub),
  },
  {
    path: 'auto-hub-details/:id',
    title: `Detalle del vehículo | ${BRAND}`,
    loadComponent: () =>
      import('./pages/auto-hub-details/auto-hub-details').then((m) => m.AutoHubDetails),
  },

  // --- Tienda: accesorios y piezas de X AutoHub (carrito + checkout) ---
  //
  // `/tienda` es el listado con filtros; `/tienda/c/:slug` es la misma pagina con
  // una categoria fija y su titulo; `/tienda/p/:slug` es la ficha del producto.
  // Los titulos de las dos primeras los afina la propia pagina.
  //
  // Las rutas viejas siguen contestando para no romper enlaces ya publicados:
  //   · `/catalogo` redirige a `/tienda` (y conserva los query params);
  //   · `/hub-part-details/:id` resuelve el id y redirige a la ficha por slug.
  {
    path: 'tienda',
    title: `Tienda — Accesorios y piezas | ${BRAND}`,
    loadComponent: () => import('./pages/tienda/tienda').then((m) => m.Tienda),
  },
  {
    path: 'tienda/c/:slug',
    title: `Tienda — Accesorios y piezas | ${BRAND}`,
    loadComponent: () => import('./pages/tienda/tienda').then((m) => m.Tienda),
  },
  {
    path: 'tienda/p/:slug',
    title: `Producto | ${BRAND}`,
    loadComponent: () => import('./pages/producto/producto').then((m) => m.Producto),
  },
  { path: 'catalogo', pathMatch: 'full', redirectTo: 'tienda' },
  {
    path: 'hub-part-details/:id',
    canActivate: [productIdRedirectGuard],
    // Nunca se pinta: el guard siempre devuelve una redirección. El router pide un
    // destino y esta es la forma de no inventarle una pagina.
    children: [],
  },
  {
    path: 'buscar',
    title: `Buscar | ${BRAND}`,
    loadComponent: () => import('./pages/buscar/buscar').then((m) => m.Buscar),
  },
  {
    path: 'checkout',
    title: `Checkout | ${BRAND}`,
    loadComponent: () => import('./pages/checkout/checkout').then((m) => m.Checkout),
  },
  // El pedido ya hecho: público por id (el uuid es la llave). Ver `get_order()`.
  {
    path: 'pedido/:id',
    title: `Tu pedido | ${BRAND}`,
    loadComponent: () => import('./pages/pedido/pedido').then((m) => m.Pedido),
  },

  // --- Hub Market: publicaciones de la comunidad ---
  {
    path: 'hub-market',
    title: `Hub Market — Compra y vende | ${BRAND}`,
    loadComponent: () => import('./pages/hub-market/hub-market').then((m) => m.HubMarket),
  },
  {
    path: 'car-details/:id',
    title: `Detalle del vehículo | ${BRAND}`,
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
  // `cotizar` y `agendar` van **antes** de `:slug`: si no, "agendar" se leeria como el
  // slug de un servicio.
  {
    path: 'servicios/cotizar',
    title: `Cotizar un servicio | ${BRAND}`,
    loadComponent: () => import('./pages/cotizar/cotizar').then((m) => m.Cotizar),
  },
  {
    path: 'servicios/agendar',
    title: `Agendar una cita | ${BRAND}`,
    loadComponent: () => import('./pages/agendar/agendar').then((m) => m.Agendar),
  },
  {
    path: 'servicios/:slug',
    title: `Servicio de taller | ${BRAND}`,
    loadComponent: () => import('./pages/servicio/servicio').then((m) => m.Servicio),
  },
  {
    path: 'social-hub',
    title: `Comunidad — Clubes y eventos | ${BRAND}`,
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
    title: `Iniciar sesión | ${BRAND}`,
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
    title: `Administración | ${BRAND}`,
    canActivate: [moderatorGuard],
    loadComponent: () => import('./pages/admin/admin').then((m) => m.Admin),
    children: [
      // Antes caia en 'versiones', que un moderador no puede abrir: al entrar a
      // /admin lo habria rebotado a la raiz con un error. 'moderacion' la abren
      // los dos roles, asi que sirve de aterrizaje comun.
      { path: '', pathMatch: 'full', redirectTo: 'moderacion' },
      {
        path: 'moderacion',
        title: `Moderación | ${BRAND}`,
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
      // El taller: cuatro pestañas (citas, servicios, disponibilidad, trabajos). El padre
      // y **cada hija** llevan `adminGuard`: un moderador no abre ninguna.
      {
        path: 'taller',
        title: `Taller | ${BRAND}`,
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/taller/admin-taller').then((m) => m.AdminTaller),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'citas' },
          {
            path: 'citas',
            title: `Citas | ${BRAND}`,
            canActivate: [adminGuard],
            loadComponent: () => import('./pages/admin/taller/citas/admin-citas').then((m) => m.AdminCitas),
          },
          {
            path: 'servicios',
            title: `Servicios del taller | ${BRAND}`,
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./pages/admin/taller/servicios/admin-servicios').then((m) => m.AdminServicios),
          },
          {
            path: 'disponibilidad',
            title: `Disponibilidad | ${BRAND}`,
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./pages/admin/taller/disponibilidad/admin-disponibilidad').then((m) => m.AdminDisponibilidad),
          },
          {
            path: 'trabajos',
            title: `Trabajos realizados | ${BRAND}`,
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./pages/admin/taller/trabajos/admin-trabajos').then((m) => m.AdminTrabajos),
          },
        ],
      },
      {
        path: 'cupones',
        title: `Cupones | ${BRAND}`,
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/cupones/admin-cupones').then((m) => m.AdminCupones),
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

  // --- Club ---
  //
  // Publica y sin guard: se llega desde el enlace del correo, casi siempre sin
  // sesion. El token va en la ruta porque es la direccion de una cosa concreta,
  // no un parametro de busqueda. La pantalla **pide confirmacion** antes de dar
  // de baja — ver el comentario del componente: los clientes de correo abren los
  // enlaces por su cuenta para previsualizarlos.
  {
    path: 'baja/:token',
    title: `Baja del club | ${BRAND}`,
    loadComponent: () => import('./pages/baja/baja').then((m) => m.Baja),
  },

  // --- Novedades: el historial público de versiones ---
  {
    path: 'novedades',
    title: `Novedades | ${BRAND}`,
    loadComponent: () => import('./pages/novedades/novedades').then((m) => m.Novedades),
  },

  // --- Legal ---
  {
    path: 'terminos-condiciones',
    title: `Términos y condiciones | ${BRAND}`,
    loadComponent: () =>
      import('./pages/terminos-condiciones/terminos-condiciones').then((m) => m.TerminosCondiciones),
  },

  // Debe quedar de ultimo: captura cualquier URL que no coincida arriba.
  {
    path: '**',
    title: `Página no encontrada | ${BRAND}`,
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
  },
];
