import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClubChannel } from './club-channel';

describe('ClubChannel', () => {
  let component: ClubChannel;
  let fixture: ComponentFixture<ClubChannel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClubChannel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClubChannel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
