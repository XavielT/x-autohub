import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeWelcome } from './home-welcome';

describe('HomeWelcome', () => {
  let component: HomeWelcome;
  let fixture: ComponentFixture<HomeWelcome>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeWelcome]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeWelcome);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
