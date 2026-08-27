import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { ClubChannel } from './club-channel';
import {
  EmailSubscriptionService,
  SubscriptionResult,
} from '../../services/email-subscription.service';

describe('ClubChannel', () => {
  let component: ClubChannel;
  let fixture: ComponentFixture<ClubChannel>;

  /**
   * Doble del servicio: devuelve el resultado que pida cada prueba.
   *
   * El componente no decide si se manda el correo — solo traduce el resultado a
   * un mensaje, y es ahí donde estaba el fallo: prometía "Revisa tu correo"
   * pasara lo que pasara.
   */
  class FakeSubscriptions {
    result: SubscriptionResult = { ok: true, alreadySubscribed: false, welcomeEmailSent: false };
    fail = false;

    subscribe(): Observable<SubscriptionResult> {
      return this.fail ? throwError(() => new Error('boom')) : of(this.result);
    }
  }

  let subscriptions: FakeSubscriptions;

  beforeEach(async () => {
    subscriptions = new FakeSubscriptions();

    await TestBed.configureTestingModule({
      imports: [ClubChannel],
      providers: [
        {
          provide: EmailSubscriptionService,
          useValue: subscriptions as unknown as EmailSubscriptionService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClubChannel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  const suscribir = async (email = 'quien.sea@correo.com') => {
    component.email.set(email);
    component.onSubmit();
    await fixture.whenStable();
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('el mensaje de exito', () => {
    it('no promete un correo cuando no se envio ninguno', async () => {
      subscriptions.result = { ok: true, alreadySubscribed: false, welcomeEmailSent: false };

      await suscribir();

      expect(component.feedbackType()).toBe('success');
      expect(component.feedbackMessage()).toBe('¡Listo! Ya eres parte del club.');
      expect(component.feedbackMessage()).not.toContain('correo');
    });

    it('promete el correo solo cuando de verdad salio', async () => {
      subscriptions.result = { ok: true, alreadySubscribed: false, welcomeEmailSent: true };

      await suscribir();

      expect(component.feedbackMessage()).toBe('¡Bienvenido al club! Revisa tu correo.');
    });

    it('lo dice cuando ya estabas suscrito', async () => {
      subscriptions.result = { ok: true, alreadySubscribed: true, welcomeEmailSent: false };

      await suscribir();

      expect(component.feedbackType()).toBe('success');
      expect(component.feedbackMessage()).toBe('Ya estabas en el club.');
    });

    it('vacia el campo y suelta el boton', async () => {
      await suscribir();

      expect(component.email()).toBe('');
      expect(component.isLoading()).toBe(false);
    });
  });

  describe('el resto', () => {
    it('rechaza un correo invalido sin llamar al servicio', async () => {
      const llamar = vi.spyOn(subscriptions, 'subscribe');

      await suscribir('no-es-un-correo');

      expect(llamar).not.toHaveBeenCalled();
      expect(component.feedbackType()).toBe('error');
    });

    it('avisa cuando la suscripcion falla de verdad', async () => {
      subscriptions.fail = true;

      await suscribir();

      expect(component.feedbackType()).toBe('error');
      expect(component.feedbackMessage()).toBe('Algo salió mal. Intenta de nuevo.');
    });
  });
});
