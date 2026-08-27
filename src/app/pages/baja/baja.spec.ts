import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { Baja } from './baja';
import { EmailSubscriptionService } from '../../../shared/services/email-subscription.service';

/**
 * La pantalla de baja del club.
 *
 * Lo que más importa aquí no es lo que hace, es lo que **no** hace: no da de baja
 * al cargar. Los clientes de correo y los antivirus abren los enlaces por su
 * cuenta para previsualizarlos, así que una baja al cargar sacaría de la lista a
 * gente que nunca hizo clic. La primera prueba es esa.
 */
describe('Baja', () => {
  class FakeSubscriptions {
    salio = true;
    fail = false;
    llamadas: string[] = [];

    unsubscribe(token: string): Observable<boolean> {
      this.llamadas.push(token);
      return this.fail ? throwError(() => new Error('boom')) : of(this.salio);
    }
  }

  const TOKEN = 'a1b2c3d4-1111-2222-3333-444455556666';

  let subscriptions: FakeSubscriptions;

  async function montar(token: string | null = TOKEN): Promise<ComponentFixture<Baja>> {
    subscriptions = new FakeSubscriptions();

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Baja],
      providers: [
        {
          provide: EmailSubscriptionService,
          useValue: subscriptions as unknown as EmailSubscriptionService,
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap(token === null ? {} : { token })),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Baja);
    await fixture.whenStable();
    return fixture;
  }

  const texto = (fixture: ComponentFixture<Baja>) =>
    ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

  const boton = (fixture: ComponentFixture<Baja>) =>
    (fixture.nativeElement as HTMLElement).querySelector('button');

  it('should create', async () => {
    expect((await montar()).componentInstance).toBeTruthy();
  });

  it('NO da de baja al cargar: pide confirmacion', async () => {
    const fixture = await montar();

    // Si esto se rompe, un prefetch del cliente de correo da de baja a alguien
    // que solo recibio el correo.
    expect(subscriptions.llamadas).toEqual([]);
    expect(fixture.componentInstance.estado()).toBe('confirmar');
    expect(texto(fixture)).toContain('Vas a dejar de recibir los correos del club');
    expect(boton(fixture)?.textContent).toContain('darme de baja');
  });

  it('al confirmar, manda el token y avisa que ya esta', async () => {
    const fixture = await montar();

    boton(fixture)!.click();
    await fixture.whenStable();

    expect(subscriptions.llamadas).toEqual([TOKEN]);
    expect(fixture.componentInstance.estado()).toBe('listo');
    expect(texto(fixture)).toContain('ya no recibiras mas correos');
  });

  it('un token que no corresponde a nadie no es un error para el usuario', async () => {
    const fixture = await montar();
    subscriptions.salio = false;

    boton(fixture)!.click();
    await fixture.whenStable();

    // Pasa al abrir dos veces el mismo enlace: no hay nada que arreglar y no
    // conviene enseñar un error rojo por eso.
    expect(fixture.componentInstance.estado()).toBe('invalido');
    expect(texto(fixture)).toContain('Este enlace ya no vale');
  });

  it('sin token en la ruta, no llama a nadie', async () => {
    const fixture = await montar(null);

    expect(fixture.componentInstance.estado()).toBe('invalido');
    expect(subscriptions.llamadas).toEqual([]);
  });

  it('si la base falla, ofrece reintentar y no dice que quedo dado de baja', async () => {
    const fixture = await montar();
    subscriptions.fail = true;

    boton(fixture)!.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.estado()).toBe('error');
    expect(texto(fixture)).toContain('Algo salio mal');
    expect(texto(fixture)).not.toContain('ya no recibiras');
    expect(boton(fixture)?.textContent).toContain('Intentar de nuevo');
  });
});
