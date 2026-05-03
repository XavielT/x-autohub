import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HubMarketPartDetails } from './hub-market-part-details';

describe('HubMarketPartDetails', () => {
  let component: HubMarketPartDetails;
  let fixture: ComponentFixture<HubMarketPartDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HubMarketPartDetails]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HubMarketPartDetails);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});