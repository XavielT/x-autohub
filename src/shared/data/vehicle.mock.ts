import { VehicleMakeModel, VehicleModelModel } from '../models/product.model';
import { slugify } from '../utils/slugify';

/**
 * Marcas y modelos de la semilla de `supabase/migrations/0017_store_catalog.sql`
 * (las ~35 marcas que se ven en RD) y de `0061_vehicle_models_catalog.sql`, que
 * le suma modelos a todas: 517 en total. Es el catálogo inicial, no uno
 * completo; lo que falte se carga desde el admin.
 *
 * Los ids de aquí son los del mock. En la base real los asigna Postgres, y
 * nada del código los asume iguales: lo que une los dos lados es el `slug`.
 */
const MAKE_NAMES: readonly string[] = [
  'Toyota', 'Honda', 'Hyundai', 'Kia', 'Nissan', 'Mitsubishi', 'Suzuki', 'Chevrolet',
  'Ford', 'Jeep', 'Mazda', 'Mercedes-Benz', 'BMW', 'Audi', 'Volkswagen', 'Lexus',
  'Subaru', 'Isuzu', 'Daihatsu', 'Peugeot', 'Citroën', 'Renault', 'Fiat', 'Chery',
  'BYD', 'Geely', 'Great Wall', 'JAC', 'MG', 'Land Rover', 'Porsche', 'Volvo',
  'Tesla', 'Dodge', 'RAM',
];

const MODEL_NAMES: Readonly<Record<string, readonly string[]>> = {
  toyota: ['Corolla', 'Camry', 'Yaris', 'RAV4', 'Highlander', 'Land Cruiser', 'Prado', 'Hilux', '4Runner', 'Fortuner', 'Rush', 'Avalon', 'Tacoma', 'Tundra', 'Sequoia', 'C-HR', 'Corolla Cross', 'Sienna', 'Hiace', 'Raize', 'Vitz', 'Prius', 'Agya', '86'],
  honda: ['Civic', 'Accord', 'CR-V', 'HR-V', 'Fit', 'City', 'Pilot', 'Odyssey', 'Ridgeline', 'Passport', 'BR-V', 'WR-V', 'Insight', 'Element', 'Brio'],
  hyundai: ['Elantra', 'Accent', 'Tucson', 'Santa Fe', 'Sonata', 'Creta', 'Kona', 'i10', 'Venue', 'Palisade', 'Veloster', 'Ioniq', 'Grand i10', 'Getz', 'Atos', 'H-1', 'Starex', 'Azera', 'Genesis', 'Terracan', 'Bayon', 'Stargazer'],
  kia: ['Rio', 'Cerato', 'Sportage', 'Sorento', 'Picanto', 'Seltos', 'Soul', 'Optima', 'Carnival', 'Telluride', 'Stinger', 'Forte', 'K5', 'Niro', 'Sonet', 'Carens', 'Sedona', 'Bongo', 'EV6'],
  nissan: ['Sentra', 'Versa', 'Altima', 'Kicks', 'X-Trail', 'Rogue', 'Frontier', 'Pathfinder', 'March', 'Qashqai', 'Murano', 'Maxima', 'Armada', 'Titan', 'Navara', 'NP300', 'Juke', 'Note', 'Tiida', 'Patrol', 'Xterra', 'Leaf', 'Sunny', 'Almera', 'Terrano'],
  mitsubishi: ['L200', 'Outlander', 'Montero', 'Montero Sport', 'ASX', 'Lancer', 'Mirage', 'Eclipse Cross', 'Pajero', 'Xpander', 'Colt', 'Galant', 'Space Star', 'RVR', 'Triton', 'Endeavor'],
  suzuki: ['Swift', 'Vitara', 'Jimny', 'Baleno', 'Ertiga', 'Celerio', 'S-Presso', 'Grand Vitara', 'Alto', 'Ciaz', 'Dzire', 'Ignis', 'SX4', 'XL7', 'Wagon R', 'Fronx', 'Kizashi', 'Samurai', 'Carry'],
  chevrolet: ['Spark', 'Aveo', 'Cruze', 'Malibu', 'Equinox', 'Tahoe', 'Silverado', 'Trax', 'Captiva', 'Camaro', 'Suburban', 'Colorado', 'Blazer', 'Traverse', 'Bolt', 'Onix', 'Sail', 'Optra', 'Corvette', 'Impala', 'Cobalt', 'Beat', 'Orlando', 'N300', 'Express'],
  ford: ['Ranger', 'Explorer', 'Escape', 'F-150', 'Fusion', 'Focus', 'Fiesta', 'Edge', 'Mustang', 'EcoSport', 'Bronco', 'Bronco Sport', 'Expedition', 'Transit', 'Taurus', 'Territory', 'Maverick', 'Kuga', 'Flex', 'Everest', 'F-250', 'Figo', 'Ka'],
  jeep: ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade', 'Gladiator', 'Patriot', 'Liberty', 'Commander', 'Avenger', 'Wagoneer'],
  mazda: ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-30', 'CX-5', 'CX-50', 'CX-7', 'CX-9', 'CX-90', 'MX-5 Miata', 'BT-50', 'Tribute', 'RX-8', 'Demio'],
  'mercedes-benz': ['Clase A', 'Clase B', 'Clase C', 'Clase E', 'Clase S', 'CLA', 'CLS', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'Clase G', 'ML', 'GLK', 'SLK', 'Sprinter', 'Vito'],
  bmw: ['Serie 1', 'Serie 2', 'Serie 3', 'Serie 4', 'Serie 5', 'Serie 7', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4', 'i3', 'M3'],
  audi: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q5', 'Q7', 'Q8', 'TT', 'e-tron'],
  volkswagen: ['Golf', 'Jetta', 'Passat', 'Polo', 'Tiguan', 'Touareg', 'Beetle', 'Atlas', 'Taos', 'T-Cross', 'Virtus', 'Amarok', 'Saveiro', 'Gol', 'Vento', 'Bora', 'Fox', 'Teramont', 'ID.4'],
  lexus: ['IS', 'ES', 'GS', 'LS', 'NX', 'RX', 'GX', 'LX', 'UX', 'RC', 'LC', 'CT'],
  subaru: ['Impreza', 'Legacy', 'Outback', 'Forester', 'XV', 'Crosstrek', 'WRX', 'BRZ', 'Ascent', 'Tribeca'],
  isuzu: ['D-Max', 'MU-X', 'Trooper', 'Rodeo', 'NHR', 'NKR', 'NPR', 'FRR', 'Panther'],
  daihatsu: ['Terios', 'Sirion', 'Mira', 'Charade', 'Hijet', 'Rocky', 'Ayla', 'Gran Max', 'Xenia', 'Cuore', 'Move', 'Taft'],
  peugeot: ['206', '207', '208', '301', '307', '308', '508', '2008', '3008', '5008', 'Partner', 'Expert', 'Boxer', 'Rifter'],
  citroen: ['C3', 'C4', 'C5', 'C-Elysée', 'Berlingo', 'Jumpy', 'Jumper', 'C3 Aircross', 'C4 Cactus', 'Xsara Picasso'],
  renault: ['Logan', 'Sandero', 'Duster', 'Kwid', 'Clio', 'Megane', 'Symbol', 'Stepway', 'Captur', 'Koleos', 'Oroch', 'Kangoo', 'Fluence', 'Master', 'Twingo'],
  fiat: ['500', 'Uno', 'Palio', 'Strada', 'Doblo', 'Punto', 'Siena', 'Argo', 'Cronos', 'Mobi', 'Toro', 'Fiorino', 'Ducato', 'Linea', 'Tipo', 'Pulse', 'Fastback'],
  chery: ['Tiggo 2', 'Tiggo 2 Pro', 'Tiggo 3', 'Tiggo 4', 'Tiggo 4 Pro', 'Tiggo 7', 'Tiggo 7 Pro', 'Tiggo 8', 'Tiggo 8 Pro', 'Arrizo 5', 'Arrizo 6', 'QQ', 'Omoda 5'],
  byd: ['F3', 'Song Plus', 'Tang', 'Han', 'Yuan Up', 'Atto 3', 'Dolphin', 'Seal', 'Qin', 'Seagull', 'Shark'],
  geely: ['Emgrand', 'Emgrand X7', 'Coolray', 'Azkarra', 'Okavango', 'Tugella', 'GX3 Pro', 'GS', 'Geometry C', 'Monjaro', 'Starray'],
  'great-wall': ['Wingle 5', 'Wingle 7', 'Haval H2', 'Haval H6', 'Haval H9', 'Haval Jolion', 'Haval Dargo', 'Poer', 'Tank 300', 'Tank 500', 'Voleex C30', 'Hover'],
  jac: ['J2', 'J4', 'J7', 'S2', 'S3', 'S4', 'S5', 'JS4', 'T6', 'T8', 'X200', 'Refine', 'Sunray', 'Hunter', 'E-JS1'],
  mg: ['MG3', 'MG4', 'MG5', 'MG6', 'ZS', 'ZS EV', 'HS', 'RX5', 'GT', 'Marvel R', '350', '550', '750', 'Hector', 'Cyberster'],
  'land-rover': ['Defender', 'Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Range Rover Velar', 'Freelander', 'LR2', 'LR3', 'LR4'],
  porsche: ['911', '718 Boxster', '718 Cayman', 'Boxster', 'Cayman', 'Cayenne', 'Macan', 'Panamera', 'Taycan'],
  volvo: ['XC40', 'XC60', 'XC90', 'S40', 'S60', 'S80', 'S90', 'V40', 'V60', 'V90', 'C30', 'C40', 'EX30'],
  tesla: ['Model 3', 'Model S', 'Model X', 'Model Y', 'Cybertruck'],
  dodge: ['Charger', 'Challenger', 'Durango', 'Journey', 'Caliber', 'Dart', 'Grand Caravan', 'Neon', 'Avenger', 'Nitro', 'Viper', 'Magnum'],
  ram: ['1500', '2500', '3500', '700', '1000', 'ProMaster', 'ProMaster City', 'Dakota', 'Rampage', 'Classic'],
};

export const VEHICLE_MAKES_MOCK: VehicleMakeModel[] = MAKE_NAMES.map((name, index) => ({
  id: index + 1,
  name,
  slug: slugify(name),
}));

export const VEHICLE_MODELS_MOCK: VehicleModelModel[] = (() => {
  const models: VehicleModelModel[] = [];
  for (const make of VEHICLE_MAKES_MOCK) {
    for (const name of MODEL_NAMES[make.slug] ?? []) {
      models.push({ id: models.length + 1, makeId: make.id, name, slug: slugify(name) });
    }
  }
  return models;
})();
