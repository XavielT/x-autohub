import { TestBed } from '@angular/core/testing';

import { AutohubCard } from './autohub-card';
import { AUTO_HUB_MOCK } from '../../data/auto-hub.mock';

describe('AutohubCard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutohubCard],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(AutohubCard);
    // `autoHub` es un input requerido: sin asignarlo la plantilla explota.
    fixture.componentRef.setInput('autoHub', AUTO_HUB_MOCK[0]);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
