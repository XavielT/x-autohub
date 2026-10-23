import { compatibilityOf } from './product-compat';
import { ProductFitmentModel } from '../models/product.model';
import { makeProduct } from '../testing/product.fixture';

const fit = (over: Partial<ProductFitmentModel> = {}): ProductFitmentModel => ({
  id: 1, productId: 1, makeId: 1, modelId: 1, yearFrom: 2010, yearTo: 2020, ...over,
});

const corolla2015 = { makeId: 1, modelId: 1, year: 2015 };

describe('compatibilityOf', () => {
  it('un universal sirve siempre, con o sin vehiculo y con o sin fitments', () => {
    const p = makeProduct({ fitmentType: 'universal' });

    expect(compatibilityOf(p, [], null).kind).toBe('universal');
    expect(compatibilityOf(p, [], corolla2015).kind).toBe('universal');
  });

  it('especifico sin fitments cargados es "consultar", nunca compatible', () => {
    const p = makeProduct({ fitmentType: 'specific' });

    expect(compatibilityOf(p, [], corolla2015).kind).toBe('consult');
    expect(compatibilityOf(p, [], null).kind).toBe('consult');
  });

  it('especifico con fitments y sin vehiculo elegido muestra la lista', () => {
    const p = makeProduct({ fitmentType: 'specific' });

    expect(compatibilityOf(p, [fit()], null).kind).toBe('list');
  });

  it('con vehiculo: compatible si un fitment lo cubre, incompatible si ninguno', () => {
    const p = makeProduct({ fitmentType: 'specific' });

    expect(compatibilityOf(p, [fit()], corolla2015).kind).toBe('compatible');
    expect(compatibilityOf(p, [fit()], { ...corolla2015, year: 2005 }).kind).toBe('incompatible');
    expect(compatibilityOf(p, [fit({ makeId: 2 })], corolla2015).kind).toBe('incompatible');
  });

  it('ignora los fitments de otros productos', () => {
    const p = makeProduct({ id: 1, fitmentType: 'specific' });

    expect(compatibilityOf(p, [fit({ productId: 99 })], corolla2015).kind).toBe('consult');
  });
});
