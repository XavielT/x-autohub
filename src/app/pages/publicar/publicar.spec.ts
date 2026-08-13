import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Publicar } from './publicar';

describe('Publicar', () => {
  let component: Publicar;
  let fixture: ComponentFixture<Publicar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Publicar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Publicar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});