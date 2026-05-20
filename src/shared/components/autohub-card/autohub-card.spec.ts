import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AutohubCard } from './autohub-card';

describe('AutohubCard', () => {
  let component: AutohubCard;
  let fixture: ComponentFixture<AutohubCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutohubCard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AutohubCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
