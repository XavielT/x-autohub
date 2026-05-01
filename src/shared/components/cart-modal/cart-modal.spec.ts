import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CartModal } from './cart-modal';

describe('CartModal', () => {
  let component: CartModal;
  let fixture: ComponentFixture<CartModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CartModal],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(CartModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
