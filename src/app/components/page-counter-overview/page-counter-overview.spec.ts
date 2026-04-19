import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PageCounterOverview } from './page-counter-overview';

describe('PageCounterOverview', () => {
  let component: PageCounterOverview;
  let fixture: ComponentFixture<PageCounterOverview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PageCounterOverview]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PageCounterOverview);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
