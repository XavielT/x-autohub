import { TestBed } from '@angular/core/testing';

import { CarCard } from './car-card';
import { HUB_MARKET_ITEMS_MOCK } from '../../data/hub-market-item.mock';

describe('CarCard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CarCard],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(CarCard);
    const vehicle = HUB_MARKET_ITEMS_MOCK.find((item) => item.category === 'vehiculos');
    fixture.componentRef.setInput('car', vehicle);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
