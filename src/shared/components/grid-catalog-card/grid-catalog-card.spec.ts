import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GridCatalogCard } from './grid-catalog-card';

describe('GridCatalogCard', () => {
  let component: GridCatalogCard;
  let fixture: ComponentFixture<GridCatalogCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GridCatalogCard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GridCatalogCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
