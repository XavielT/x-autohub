import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PublicarComponent } from './publicar';

describe('PublicarComponent', () => {
  let component: PublicarComponent;
  let fixture: ComponentFixture<PublicarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PublicarComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});