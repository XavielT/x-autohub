import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AutoHub } from './auto-hub';

describe('AutoHub', () => {
  let component: AutoHub;
  let fixture: ComponentFixture<AutoHub>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutoHub]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AutoHub);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
