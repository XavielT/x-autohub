import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SocialHub } from './social-hub';

describe('SocialHub', () => {
  let component: SocialHub;
  let fixture: ComponentFixture<SocialHub>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialHub]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SocialHub);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
