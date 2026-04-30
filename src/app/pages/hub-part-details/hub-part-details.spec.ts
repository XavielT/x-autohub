import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HubPartDetails } from './hub-part-details';

describe('HubPartDetails', () => {
  let component: HubPartDetails;
  let fixture: ComponentFixture<HubPartDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HubPartDetails]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HubPartDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
