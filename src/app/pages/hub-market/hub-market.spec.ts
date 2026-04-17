import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HubMarketComponent } from './hub-market';

describe('HubMarketComponent', () => {
  let component: HubMarketComponent;
  let fixture: ComponentFixture<HubMarketComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HubMarketComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HubMarketComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
