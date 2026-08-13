import { TestBed } from '@angular/core/testing';

import { GridCatalogCard } from './grid-catalog-card';
import { CATALOG_ITEMS_MOCK } from '../../data/catalog-items.mock';

describe('GridCatalogCard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GridCatalogCard],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(GridCatalogCard);
    fixture.componentRef.setInput('item', CATALOG_ITEMS_MOCK[0]);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('maps a catalog item to its catalogo category filter', () => {
    const fixture = TestBed.createComponent(GridCatalogCard);
    const suspension = CATALOG_ITEMS_MOCK.find((item) => item.category === 'SUSPENSION');
    fixture.componentRef.setInput('item', suspension);
    expect(fixture.componentInstance.catalogQueryParams()).toEqual({ category: 'suspension' });
  });
});
