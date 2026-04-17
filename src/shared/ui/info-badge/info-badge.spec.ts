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
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
