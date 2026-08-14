import {
  DO_LOCATIONS,
  filterLocations,
  isCanonicalLocation,
  nearestLocation,
  normalizeLocation,
} from './locations';

describe('DO_LOCATIONS', () => {
  it('trae las 31 provincias mas el Distrito Nacional', () => {
    expect(DO_LOCATIONS.length).toBe(32);
    expect(DO_LOCATIONS.some((l) => l.name === 'Distrito Nacional')).toBe(true);
  });

  it('no repite nombres', () => {
    const names = DO_LOCATIONS.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('todos los centroides caen dentro de la isla', () => {
    // Caja que envuelve a República Dominicana. Un centroide fuera de aqui es un
    // signo o una coordenada intercambiada, y el mapa lo mostraria en el oceano.
    for (const l of DO_LOCATIONS) {
      expect(l.lat).toBeGreaterThan(17.5);
      expect(l.lat).toBeLessThan(20);
      expect(l.lng).toBeGreaterThan(-72.1);
      expect(l.lng).toBeLessThan(-68.2);
    }
  });
});

describe('normalizeLocation', () => {
  it('quita acentos y pasa a minusculas', () => {
    expect(normalizeLocation('Samaná')).toBe('samana');
    expect(normalizeLocation('  Elías Piña ')).toBe('elias pina');
  });
});

describe('filterLocations', () => {
  it('encuentra por coincidencia exacta de nombre', () => {
    expect(filterLocations('Santiago').map((l) => l.name)).toEqual([
      'Santiago',
      'Santiago Rodríguez',
    ]);
  });

  it('no distingue mayusculas', () => {
    expect(filterLocations('santiago').map((l) => l.name)).toContain('Santiago');
  });

  it('no distingue acentos en ninguno de los dos lados', () => {
    // Lo escrito sin acento encuentra el nombre acentuado...
    expect(filterLocations('samana').map((l) => l.name)).toEqual(['Samaná']);
    // ...y devuelve todas las que contienen el trozo, no solo la primera.
    expect(filterLocations('sanchez').map((l) => l.name)).toEqual([
      'María Trinidad Sánchez',
      'Sánchez Ramírez',
    ]);
    // ...y al contrario: escrito con acento encuentra igual.
    expect(filterLocations('piña').map((l) => l.name)).toEqual(['Elías Piña']);
    // Y "peña" no es "piña": normalizar acentos no vuelve todo equivalente.
    expect(filterLocations('Peña').map((l) => l.name)).toEqual([]);
  });

  it('coincide por cualquier parte del nombre, no solo el inicio', () => {
    expect(filterLocations('macoris').map((l) => l.name)).toEqual(['San Pedro de Macorís']);
  });

  it('con la busqueda vacia devuelve todo', () => {
    expect(filterLocations('').length).toBe(32);
    expect(filterLocations('   ').length).toBe(32);
  });

  it('compara solo contra el nombre, no contra la cabecera de provincia', () => {
    // "Higuey" es la cabecera de La Altagracia, pero no esta en el dato: buscarla
    // no devuelve nada. Queda anotado para que no se lea como un fallo.
    expect(filterLocations('higuey')).toEqual([]);
    expect(filterLocations('bonao')).toEqual([]);
  });

  it('devuelve vacio cuando nada coincide', () => {
    expect(filterLocations('miami')).toEqual([]);
  });
});

describe('nearestLocation', () => {
  it('resuelve un punto dentro de una provincia a esa provincia', () => {
    // Centro de Santiago de los Caballeros.
    expect(nearestLocation(19.45, -70.69).name).toBe('Santiago');
  });

  it('resuelve el centro de la capital al Distrito Nacional', () => {
    expect(nearestLocation(18.47, -69.9).name).toBe('Distrito Nacional');
  });

  it('resuelve Punta Cana a La Altagracia', () => {
    // Es el caso que arregla el dato viejo: "Punta Cana" no es una provincia.
    expect(nearestLocation(18.58, -68.4).name).toBe('La Altagracia');
  });

  it('un clic en el mar devuelve la provincia mas cercana, no un error', () => {
    // Al sur de Barahona, mar adentro.
    expect(nearestLocation(17.7, -71.1).name).toBe('Barahona');
  });

  it('usa haversine y no distancia plana en grados', () => {
    // Cerca del ecuador un grado de longitud mide menos que uno de latitud, asi
    // que tratar los grados como si fueran iguales desplaza el resultado. Este
    // punto es uno de los ~600 del area donde las dos formulas discrepan:
    // en grados gana Barahona, en kilometros gana Pedernales.
    const punto = { lat: 17.6, lng: -71.26 };
    const enGrados = (a: { lat: number; lng: number }) =>
      (a.lat - punto.lat) ** 2 + (a.lng - punto.lng) ** 2;

    const barahona = DO_LOCATIONS.find((l) => l.name === 'Barahona')!;
    const pedernales = DO_LOCATIONS.find((l) => l.name === 'Pedernales')!;

    expect(enGrados(barahona)).toBeLessThan(enGrados(pedernales));
    expect(nearestLocation(punto.lat, punto.lng).name).toBe('Pedernales');
  });
});

describe('isCanonicalLocation', () => {
  it('acepta un nombre de la lista', () => {
    expect(isCanonicalLocation('La Romana')).toBe(true);
  });

  it('rechaza los valores viejos que hay en la base', () => {
    // Estos existen hoy en hub_market_items y auto_hub_vehicles. El selector los
    // conserva en vez de borrarlos; esta funcion es la que los detecta.
    for (const viejo of ['Santo Domingo Este', 'Punta Cana', 'Bani', 'Neiba']) {
      expect(isCanonicalLocation(viejo)).toBe(false);
    }
  });

  it('distingue mayusculas y acentos, porque es el valor guardado', () => {
    expect(isCanonicalLocation('santiago')).toBe(false);
    expect(isCanonicalLocation('Samana')).toBe(false);
  });
});
