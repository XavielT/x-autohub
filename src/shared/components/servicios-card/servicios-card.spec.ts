import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServiciosCard } from './servicios-card';

describe('ServiciosCard', () => {
  let component: ServiciosCard;
  let fixture: ComponentFixture<ServiciosCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiciosCard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiciosCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
