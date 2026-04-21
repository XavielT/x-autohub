import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewCard } from './new-card';

describe('NewCard', () => {
  let component: NewCard;
  let fixture: ComponentFixture<NewCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewCard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
