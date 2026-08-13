import { TestBed } from '@angular/core/testing';

import { NotFound } from './not-found';

describe('NotFound', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotFound],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(NotFound);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('offers a way back into the main sections', async () => {
    const fixture = TestBed.createComponent(NotFound);
    await fixture.whenStable();

    const links = (fixture.nativeElement as HTMLElement).querySelectorAll('a');
    expect(links.length).toBeGreaterThan(1);
  });
});
