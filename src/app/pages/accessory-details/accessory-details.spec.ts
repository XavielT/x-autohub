import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccessoryDetails } from './accessory-details';

describe('AccessoryDetails', () => {
  let component: AccessoryDetails;
  let fixture: ComponentFixture<AccessoryDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccessoryDetails]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AccessoryDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});