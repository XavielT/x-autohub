import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AutoHubDetails } from './auto-hub-details';

describe('AutoHubDetails', () => {
  let component: AutoHubDetails;
  let fixture: ComponentFixture<AutoHubDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutoHubDetails]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AutoHubDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
