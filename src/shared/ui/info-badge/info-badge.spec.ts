import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InfoBadge } from './info-badge';

describe('InfoBadge', () => {
  let component: InfoBadge;
  let fixture: ComponentFixture<InfoBadge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InfoBadge]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InfoBadge);
    component = fixture.componentInstance;
    // `text` es un input requerido: sin valor la plantilla lanza NG0950.
    fixture.componentRef.setInput('text', 'Santo Domingo');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
