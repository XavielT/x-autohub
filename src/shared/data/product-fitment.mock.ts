import { ProductFitmentModel } from '../models/product.model';
import { slugify } from '../utils/slugify';
import { VEHICLE_MAKES_MOCK, VEHICLE_MODELS_MOCK } from './vehicle.mock';

/**
 * Compatibilidad de las piezas `specific` del mock, escrita por **slug** de
 * marca y de modelo (no por id): es lo que usa `scripts/generate-seed.mjs` para
 * resolver los ids reales con un subselect, porque los ids de la base los
 * asigna Postgres.
 *
 * Quedan **sin** compatibilidad cargada, a propósito, las piezas 1 y 13: son
 * `specific` y la ficha tiene que decir "Consultar compatibilidad" en vez de
 * afirmar algo que nadie declaró.
 *
 * `model: null` = toda la marca; `yearFrom` / `yearTo` nulos = sin límite.
 */
export interface ProductFitmentSeed {
  productId: number;
  makeSlug: string;
  /** Nombre del modelo tal como está en `vehicle.mock.ts`; nulo = toda la marca. */
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
}

export const PRODUCT_FITMENT_SEEDS: readonly ProductFitmentSeed[] = [
  { productId: 2, makeSlug: 'honda', model: 'Civic', yearFrom: 2016, yearTo: 2021 },
  { productId: 2, makeSlug: 'toyota', model: 'Corolla', yearFrom: 2014, yearTo: 2019 },
  { productId: 3, makeSlug: 'honda', model: 'Civic', yearFrom: 2012, yearTo: 2015 },
  { productId: 3, makeSlug: 'toyota', model: 'Corolla', yearFrom: 2009, yearTo: 2013 },
  { productId: 5, makeSlug: 'hyundai', model: 'Elantra', yearFrom: 2011, yearTo: 2016 },
  { productId: 5, makeSlug: 'kia', model: 'Cerato', yearFrom: 2012, yearTo: 2018 },
  { productId: 5, makeSlug: 'nissan', model: 'Sentra', yearFrom: 2013, yearTo: 2019 },
  { productId: 6, makeSlug: 'ford', model: 'Mustang', yearFrom: 2015, yearTo: 2023 },
  { productId: 8, makeSlug: 'toyota', model: 'RAV4', yearFrom: 2019, yearTo: 2024 },
  { productId: 8, makeSlug: 'honda', model: 'CR-V', yearFrom: 2017, yearTo: 2022 },
  { productId: 9, makeSlug: 'honda', model: 'Civic', yearFrom: 2006, yearTo: 2011 },
  { productId: 11, makeSlug: 'toyota', model: 'Corolla', yearFrom: 2009, yearTo: 2019 },
  { productId: 11, makeSlug: 'honda', model: 'Civic', yearFrom: 2012, yearTo: 2020 },
  { productId: 14, makeSlug: 'toyota', model: 'Hilux', yearFrom: 2005, yearTo: 2015 },
  { productId: 14, makeSlug: 'mitsubishi', model: 'L200', yearFrom: 2006, yearTo: 2015 },
  { productId: 15, makeSlug: 'toyota', model: 'Corolla', yearFrom: 2009, yearTo: 2013 },
  { productId: 15, makeSlug: 'honda', model: 'Civic', yearFrom: 2006, yearTo: 2011 },
  { productId: 16, makeSlug: 'toyota', model: null, yearFrom: null, yearTo: null },
  { productId: 16, makeSlug: 'honda', model: null, yearFrom: null, yearTo: null },
  { productId: 17, makeSlug: 'honda', model: 'Civic', yearFrom: 2016, yearTo: 2021 },
  { productId: 18, makeSlug: 'ford', model: 'Mustang', yearFrom: 2015, yearTo: 2023 },
  { productId: 19, makeSlug: 'honda', model: 'Civic', yearFrom: 2006, yearTo: 2011 },
  { productId: 21, makeSlug: 'subaru', model: null, yearFrom: 2008, yearTo: 2014 },
  { productId: 22, makeSlug: 'honda', model: null, yearFrom: null, yearTo: null },
  { productId: 23, makeSlug: 'toyota', model: 'Hilux', yearFrom: 2005, yearTo: 2015 },
  { productId: 25, makeSlug: 'jeep', model: 'Wrangler', yearFrom: 2007, yearTo: 2018 },
  { productId: 31, makeSlug: 'honda', model: 'Civic', yearFrom: 2006, yearTo: 2015 },
  { productId: 31, makeSlug: 'toyota', model: 'Corolla', yearFrom: 2009, yearTo: 2019 },
  { productId: 33, makeSlug: 'honda', model: 'Civic', yearFrom: 2016, yearTo: 2021 },
];

/** Los mismos fitments ya con ids, para el modo mock. */
export const PRODUCT_FITMENTS_MOCK: ProductFitmentModel[] = PRODUCT_FITMENT_SEEDS.map((f, index) => {
  const make = VEHICLE_MAKES_MOCK.find((m) => m.slug === f.makeSlug);
  if (!make) throw new Error(`Marca desconocida en los fitments del mock: ${f.makeSlug}`);

  let modelId: number | null = null;
  if (f.model !== null) {
    const model = VEHICLE_MODELS_MOCK.find(
      (m) => m.makeId === make.id && m.slug === slugify(f.model as string),
    );
    if (!model) throw new Error(`Modelo desconocido en los fitments del mock: ${f.makeSlug} ${f.model}`);
    modelId = model.id;
  }

  return {
    id: index + 1,
    productId: f.productId,
    makeId: make.id,
    modelId,
    yearFrom: f.yearFrom,
    yearTo: f.yearTo,
  };
});
