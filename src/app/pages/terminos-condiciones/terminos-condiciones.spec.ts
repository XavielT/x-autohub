import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TerminosCondiciones } from './terminos-condiciones';

describe('TerminosCondiciones', () => {
  let component: TerminosCondiciones;
  let fixture: ComponentFixture<TerminosCondiciones>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TerminosCondiciones]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TerminosCondiciones);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
