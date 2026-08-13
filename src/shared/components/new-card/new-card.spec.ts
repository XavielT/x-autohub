import { TestBed } from '@angular/core/testing';

import { NewCard } from './new-card';
import { NEWS_MOCK } from '../../data/new-card.mock';

describe('NewCard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewCard],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(NewCard);
    fixture.componentRef.setInput('newCard', NEWS_MOCK[0]);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
