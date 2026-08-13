import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HubMarket } from './hub-market';

describe('HubMarket', () => {
  let component: HubMarket;
  let fixture: ComponentFixture<HubMarket>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HubMarket]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HubMarket);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
