import { TestBed } from '@angular/core/testing';

import { ServiciosCard } from './servicios-card';
import { SERVICES_MOCK } from '../../data/service.mock';

describe('ServiciosCard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiciosCard],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(ServiciosCard);
    fixture.componentRef.setInput('serviciosCard', SERVICES_MOCK[0]);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
