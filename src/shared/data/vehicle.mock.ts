import { VehicleMakeModel, VehicleModelModel } from '../models/product.model';
import { slugify } from '../utils/slugify';

/**
 * Marcas y modelos de la semilla de `supabase/migrations/0017_store_catalog.sql`:
 * las ~35 marcas que se ven en RD y los modelos más comunes de las diez
 * primeras. No es un catálogo completo ni pretende serlo; el resto se carga
 * desde el admin.
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
  toyota: ['Corolla', 'Camry', 'Yaris', 'RAV4', 'Highlander', 'Land Cruiser', 'Prado', 'Hilux', '4Runner', 'Fortuner', 'Rush'],
  honda: ['Civic', 'Accord', 'CR-V', 'HR-V', 'Fit', 'City', 'Pilot', 'Odyssey'],
  hyundai: ['Elantra', 'Accent', 'Tucson', 'Santa Fe', 'Sonata', 'Creta', 'Kona', 'i10', 'Venue'],
  kia: ['Rio', 'Cerato', 'Sportage', 'Sorento', 'Picanto', 'Seltos', 'Soul', 'Optima'],
  nissan: ['Sentra', 'Versa', 'Altima', 'Kicks', 'X-Trail', 'Rogue', 'Frontier', 'Pathfinder', 'March', 'Qashqai'],
  mitsubishi: ['L200', 'Outlander', 'Montero', 'Montero Sport', 'ASX', 'Lancer', 'Mirage', 'Eclipse Cross'],
  suzuki: ['Swift', 'Vitara', 'Jimny', 'Baleno', 'Ertiga', 'Celerio', 'S-Presso', 'Grand Vitara'],
  chevrolet: ['Spark', 'Aveo', 'Cruze', 'Malibu', 'Equinox', 'Tahoe', 'Silverado', 'Trax', 'Captiva', 'Camaro'],
  ford: ['Ranger', 'Explorer', 'Escape', 'F-150', 'Fusion', 'Focus', 'Fiesta', 'Edge', 'Mustang', 'EcoSport'],
  jeep: ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade', 'Gladiator'],
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
