import { TestBed } from '@angular/core/testing';

import { ServiciosCard } from './servicios-card';
import { SERVICIOS_CARD_MOCK } from '../../data/servicios-card.mock';

describe('ServiciosCard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiciosCard],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(ServiciosCard);
    fixture.componentRef.setInput('serviciosCard', SERVICIOS_CARD_MOCK[0]);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
