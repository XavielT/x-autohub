import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewDetails } from './new-details';

describe('NewDetails', () => {
  let component: NewDetails;
  let fixture: ComponentFixture<NewDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewDetails]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
