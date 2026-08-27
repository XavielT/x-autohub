import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { EmailSubscriptionService } from './email-subscription.service';
import { SupabaseService } from '../../core/supabase/supabase.service';

/**
 * La suscripción al club y el correo de bienvenida.
 *
 * Estas pruebas sí ejercitan la **rama de Supabase**, que es lo contrario de lo
 * que hace el resto del suite: `test-providers.ts` inyecta `TestSupabaseService`
 * para que nada pegue a la red, así que aquí se sustituye el provider por un
 * doble propio (es lo que documenta `supabase.service.testing.ts`). No hay red
 * de por medio: el doble devuelve promesas ya resueltas.
 *
 * Lo que fijan, y por qué: Xaviel se suscribió en el sitio en vivo y **no le
 * llegó ningún correo**, porque el mensaje prometía uno que nadie enviaba. El
 * arreglo cuelga de tres reglas que son fáciles de romper sin darse cuenta:
 *
 *   1. El correo se manda **una sola vez**, en la suscripción nueva. En el
 *      duplicado no, o el botón se convierte en un reenviador a terceros.
 *   2. Que el envío falle **no** puede romper la suscripción, que ya está
 *      guardada cuando eso ocurre.
 *   3. Solo se promete el correo si la función confirma que salió.
 */
describe('EmailSubscriptionService', () => {
  /** Doble del cliente: registra lo insertado y lo invocado. */
  class FakeSupabase {
    readonly isConfigured = true;
    mockMode = false;

    /** Error que devuelve el insert (null = insertó bien). */
    insertError: { code: string; message: string } | null = null;

    /** Qué hace `functions.invoke`. */
    invokeBehavior: () => Promise<{ data: { sent?: boolean } | null; error: unknown }> = () =>
      Promise.resolve({ data: { sent: true }, error: null });

    readonly inserted: { email: string }[] = [];
    readonly invoked: { name: string; body: unknown }[] = [];

    shouldUseMockData(): boolean {
      return this.mockMode;
    }

    get db() {
      return {
        from: (_table: string) => ({
          insert: (row: { email: string }) => {
            this.inserted.push(row);
            return Promise.resolve({ error: this.insertError });
          },
        }),
        functions: {
          invoke: (name: string, options: { body: unknown }) => {
            this.invoked.push({ name, body: options.body });
            return this.invokeBehavior();
          },
        },
      } as unknown as SupabaseService['db'];
    }
  }

  let fake: FakeSupabase;
  let service: EmailSubscriptionService;

  beforeEach(() => {
    fake = new FakeSupabase();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: fake as unknown as SupabaseService }],
    });
    service = TestBed.inject(EmailSubscriptionService);
  });

  describe('modo simulado', () => {
    it('no invoca la funcion y no promete ningun correo', async () => {
      fake.mockMode = true;

      const result = await firstValueFrom(service.subscribe('quien.sea@correo.com'));

      expect(result).toEqual({ ok: true, alreadySubscribed: false, welcomeEmailSent: false });
      expect(fake.invoked).toEqual([]);
      expect(fake.inserted).toEqual([]);
    });
  });

  describe('suscripcion nueva', () => {
    it('guarda el correo normalizado e invoca club-welcome una sola vez', async () => {
      const result = await firstValueFrom(service.subscribe('  Quien.Sea@Correo.com  '));

      expect(fake.inserted).toEqual([{ email: 'quien.sea@correo.com' }]);
      expect(fake.invoked).toEqual([
        { name: 'club-welcome', body: { email: 'quien.sea@correo.com' } },
      ]);
      expect(result).toEqual({ ok: true, alreadySubscribed: false, welcomeEmailSent: true });
    });

    it('no promete el correo si la funcion responde que no lo envio', async () => {
      // Es lo que pasa mientras no exista la RESEND_API_KEY en el proyecto.
      fake.invokeBehavior = () =>
        Promise.resolve({ data: { sent: false }, error: null });

      const result = await firstValueFrom(service.subscribe('quien.sea@correo.com'));

      expect(result.ok).toBe(true);
      expect(result.welcomeEmailSent).toBe(false);
    });
  });

  describe('cuando el envio falla, la suscripcion sigue valiendo', () => {
    it('la funcion devuelve error', async () => {
      fake.invokeBehavior = () =>
        Promise.resolve({ data: null, error: { message: 'FunctionsHttpError' } });

      const result = await firstValueFrom(service.subscribe('quien.sea@correo.com'));

      expect(result).toEqual({ ok: true, alreadySubscribed: false, welcomeEmailSent: false });
    });

    it('la funcion no esta desplegada y el invoke revienta', async () => {
      fake.invokeBehavior = () => Promise.reject(new Error('Failed to fetch'));

      const result = await firstValueFrom(service.subscribe('quien.sea@correo.com'));

      expect(result).toEqual({ ok: true, alreadySubscribed: false, welcomeEmailSent: false });
    });
  });

  describe('correo repetido (23505)', () => {
    it('es un exito, pero no vuelve a mandar el correo', async () => {
      fake.insertError = { code: '23505', message: 'duplicate key value' };

      const result = await firstValueFrom(service.subscribe('quien.sea@correo.com'));

      expect(result).toEqual({ ok: true, alreadySubscribed: true, welcomeEmailSent: false });
      expect(fake.invoked).toEqual([]);
    });
  });

  describe('cualquier otro error de la base', () => {
    it('falla y no invoca la funcion', async () => {
      fake.insertError = { code: '42501', message: 'permission denied' };

      await expect(firstValueFrom(service.subscribe('quien.sea@correo.com'))).rejects.toThrow();
      expect(fake.invoked).toEqual([]);
    });
  });
});
