import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeFeaturedVehicles } from './home-featured-vehicles';

describe('HomeFeaturedVehicles', () => {
  let component: HomeFeaturedVehicles;
  let fixture: ComponentFixture<HomeFeaturedVehicles>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeFeaturedVehicles]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeFeaturedVehicles);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
