import { TestBed } from '@angular/core/testing';

import { CatalogoCard } from './catalogo-card';
import { HUB_PART_MOCK } from '../../data/hub-part.mock';

describe('CatalogoCard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CatalogoCard],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(CatalogoCard);
    fixture.componentRef.setInput('hubPart', HUB_PART_MOCK[0]);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
