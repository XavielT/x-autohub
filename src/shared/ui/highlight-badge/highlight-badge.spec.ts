import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HighlightBadge } from './highlight-badge';

describe('HighlightBadge', () => {
  let component: HighlightBadge;
  let fixture: ComponentFixture<HighlightBadge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HighlightBadge]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HighlightBadge);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
