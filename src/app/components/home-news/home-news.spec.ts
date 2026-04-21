import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeNews } from './home-news';

describe('HomeNews', () => {
  let component: HomeNews;
  let fixture: ComponentFixture<HomeNews>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeNews]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeNews);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
