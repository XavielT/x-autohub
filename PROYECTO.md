# Proyecto X-AutoHub
## Tecnologias
- Angular 17 (standalone components)
- TypeScript 5.2
- SCSS
- RxJS 7.8

## Estructura del proyecto
TODO: agregar la estructura del proyecto

## Convenciones de código
- Usar camelCase para variables y funciones
- Usar PascalCase para clases, componentes, interfaces
- Prefijo 'app-' para componentes reutilizables
- OnPush change detection en todos los componentes
- Servicios con providedIn: 'root'

## Endpoints API (backend)
- GET /api/vehicles - Listado de vehículos
- GET /api/vehicles/:id - Detalle de vehículo
- POST /api/vehicles - Crear vehículo
- PUT /api/vehicles/:id - Actualizar vehículo
- DELETE /api/vehicles/:id - Eliminar vehículo
- POST /api/auth/login - Autenticación
- POST /api/auth/logout - Cerrar sesión

## Comandos útiles
- `ng serve` - Iniciar servidor dev en http://localhost:4200
- `ng build` - Build de producción
- `ng generate component <name>` - Crear componente
- `ng generate service <name>` - Crear servicio

## Notas importantes
- La API corre en http://localhost:3000
- Usar interceptors para manejar tokens JWT
- Los colores están definidos en tailwind.config.js
