import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';

import { AI_UNAVAILABLE } from '../models/ai.model';
import { AiService } from './ai.service';
import { MapsService } from './maps.service';

const found = {
  lat: 18.4861, lng: -69.9312, place_id: 'ChIJabc', formatted: 'Av. Winston Churchill', province: 'Distrito Nacional',
  municipality: 'Santo Domingo de Guzmán', sector: 'Piantini', in_do: true, confidence: 'alta',
};

describe('MapsService (migración 0059)', () => {
  let call: ReturnType<typeof vi.fn>;
  let service: MapsService;

  const setup = (reply: unknown) => {
    call = vi.fn(() => of(reply));
    TestBed.configureTestingModule({ providers: [{ provide: AiService, useValue: { call } }] });
    service = TestBed.inject(MapsService);
  };

  it('en modo simulado (la IA no está) todo devuelve vacío y el formulario sigue a mano', async () => {
    TestBed.configureTestingModule({});
    const real = TestBed.inject(MapsService);
    expect(await firstValueFrom(real.suggest('winston churchill'))).toEqual([]);
    expect(await firstValueFrom(real.search('Calle 1'))).toEqual({ kind: 'none' });
    expect(await firstValueFrom(real.normalize('al lado del colmado Lalo'))).toBeNull();
  });

  it('no pregunta con menos de 3 letras', async () => {
    setup(AI_UNAVAILABLE);
    expect(await firstValueFrom(service.suggest('wi'))).toEqual([]);
    expect(call).not.toHaveBeenCalled();
  });

  it('traduce las sugerencias y manda el mismo token de sesión mientras se escribe', async () => {
    setup({ ok: true, data: { suggestions: [{ place_id: 'ChIJabc', text: 'Av. Winston Churchill' }] } });
    expect(await firstValueFrom(service.suggest('winston'))).toEqual([{ placeId: 'ChIJabc', text: 'Av. Winston Churchill' }]);
    await firstValueFrom(service.suggest('winston chu'));

    const [first, second] = call.mock.calls.map((c) => c[1] as { session_token?: string });
    expect(call.mock.calls[0][0]).toBe('maps-autocomplete');
    expect(first.session_token).toBeTruthy();
    expect(second.session_token).toBe(first.session_token);
  });

  it('al elegir una sugerencia se cierra la sesión: la siguiente búsqueda lleva otro token', async () => {
    setup({ ok: true, data: found });
    await firstValueFrom(service.suggest('winston'));
    const before = (call.mock.calls[0][1] as { session_token?: string }).session_token;
    await firstValueFrom(service.place('ChIJabc'));
    await firstValueFrom(service.suggest('winston'));
    const after = (call.mock.calls[2][1] as { session_token?: string }).session_token;
    expect(after).not.toBe(before);
  });

  it('un lugar de RD se traduce a un punto con su confianza', async () => {
    setup({ ok: true, data: found });
    const lookup = await firstValueFrom(service.place('ChIJabc'));
    expect(lookup).toEqual({
      kind: 'found',
      point: { lat: 18.4861, lng: -69.9312, placeId: 'ChIJabc', formatted: 'Av. Winston Churchill', province: 'Distrito Nacional', municipality: 'Santo Domingo de Guzmán', sector: 'Piantini', confidence: 'alta' },
    });
  });

  it('fuera de RD es "outside" y sin resultado es "none"', async () => {
    setup({ ok: true, data: { ...found, in_do: false } });
    expect(await firstValueFrom(service.search('Miami'))).toEqual({ kind: 'outside' });

    TestBed.resetTestingModule();
    setup({ ok: true, data: { found: false } });
    expect(await firstValueFrom(service.search('asdf'))).toEqual({ kind: 'none' });
  });

  it('una respuesta sin coordenadas válidas no es un punto', async () => {
    setup({ ok: true, data: { ...found, lat: 'norte' } });
    expect(await firstValueFrom(service.search('Calle 1'))).toEqual({ kind: 'none' });
  });

  it('una confianza desconocida baja a "baja"', async () => {
    setup({ ok: true, data: { ...found, confidence: 'altisima' } });
    const lookup = await firstValueFrom(service.search('Calle 1'));
    expect(lookup.kind === 'found' && lookup.point.confidence).toBe('baja');
  });

  it('normalize devuelve la dirección interpretada, con o sin punto', async () => {
    setup({ ok: true, data: { province: 'Santo Domingo', municipality: 'Los Alcarrizos', sector: 'Pantoja', reference: 'al lado del colmado Lalo', lat: null, lng: null, geo_confidence: 'baja' } });
    expect(await firstValueFrom(service.normalize('Pantoja, al lado del colmado Lalo'))).toEqual({
      province: 'Santo Domingo', municipality: 'Los Alcarrizos', sector: 'Pantoja', reference: 'al lado del colmado Lalo', point: null,
    });
    expect(await firstValueFrom(service.normalize('abc'))).toBeNull();
  });
});
