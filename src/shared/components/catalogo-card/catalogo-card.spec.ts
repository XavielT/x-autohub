import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CatalogoCard } from './catalogo-card';

describe('CatalogoCard', () => {
  let component: CatalogoCard;
  let fixture: ComponentFixture<CatalogoCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CatalogoCard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CatalogoCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
