import { googleMapsDirectionsUrl, googleMapsUrl } from './maps-link';

describe('maps-link: enlaces a Google Maps, sin API ni clave', () => {
  it('con coordenadas abre el punto exacto, y con place_id lo suma', () => {
    expect(googleMapsUrl({ lat: 18.48, lng: -69.93 })).toBe('https://www.google.com/maps/search/?api=1&query=18.48,-69.93');
    expect(googleMapsUrl({ lat: 18.48, lng: -69.93, placeId: 'ChIJ abc' })).toContain('&query_place_id=ChIJ%20abc');
  });

  it('sin coordenadas busca el texto, acotado a RD y bien codificado', () => {
    const url = googleMapsUrl(null, 'Calle 1 #2, Pantoja');
    expect(url).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Calle 1 #2, Pantoja, República Dominicana')}`);
  });

  it('con un solo número de las dos coordenadas no inventa un punto', () => {
    expect(googleMapsUrl({ lat: 18.48 }, 'Calle 1')).toContain(encodeURIComponent('Calle 1'));
  });

  it('sin punto ni texto no hay enlace', () => {
    expect(googleMapsUrl(null, '   ')).toBeNull();
    expect(googleMapsDirectionsUrl(null, '')).toBeNull();
  });

  it('"cómo llegar" apunta al destino', () => {
    expect(googleMapsDirectionsUrl({ lat: 18.48, lng: -69.93 })).toBe(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('18.48,-69.93')}`);
    expect(googleMapsDirectionsUrl(null, 'Calle 1')).toContain('destination=Calle%201');
  });

  it('ninguna clave de Google aparece en un enlace', () => {
    expect(googleMapsUrl({ lat: 1, lng: 2 })).not.toMatch(/key=|AIza/);
  });
});
