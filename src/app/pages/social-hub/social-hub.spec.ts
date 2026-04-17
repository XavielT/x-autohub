import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SocialHubComponent } from './social-hub';

describe('SocialHubComponent', () => {
  let component: SocialHubComponent;
  let fixture: ComponentFixture<SocialHubComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialHubComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SocialHubComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
