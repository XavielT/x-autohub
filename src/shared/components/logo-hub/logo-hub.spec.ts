import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LogoHub } from './logo-hub';

describe('LogoHub', () => {
  let component: LogoHub;
  let fixture: ComponentFixture<LogoHub>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogoHub]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LogoHub);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
