import { ReleaseModel } from '../models/release.model';

/**
 * Historial de versiones para cuando la app corre sin Supabase.
 *
 * Es el mismo contenido que siembra `supabase/migrations/0007_admin_module.sql`,
 * para que el panel se vea igual con mocks que con la base conectada.
 */
export const RELEASES_MOCK: ReleaseModel[] = [
  {
    id: 1,
    version: '0.1.0',
    releasedAt: new Date('2026-08-14T12:00:00Z'),
    title: 'Backend en vivo y auditoria de seguridad cerrada',
    summary:
      'Supabase pasa a ser la fuente de datos real y se cierran los huecos de seguridad que aparecieron al conectarlo.',
    changes: [
      'Supabase conectado y verificado contra la base real: esquema, RLS, storage y seed.',
      'Los pedidos se crean en una funcion de Postgres: el precio lo pone el servidor.',
      'Cerrada una escalada de privilegios: un usuario registrado podia hacerse administrador.',
      'Arreglado el checkout sin cuenta, que creaba el pedido y luego fallaba.',
      'El correo y el telefono de los perfiles dejan de ser publicos.',
      'Los guards esperan la restauracion de la sesion: recargar ya no saca al usuario.',
      'Cerrada una redireccion abierta en el inicio de sesion.',
      'Angular 21.2.20: seis vulnerabilidades XSS corregidas.',
      'Fuentes sin licencia comercial reemplazadas por alternativas SIL OFL.',
      'Video del home de 2.5 MB a 791 KB y logo de 77 KB a 19 KB.',
      'Los botones de agregar al carrito ahora se alcanzan con el teclado.',
    ],
    isPublished: true,
  },
];
