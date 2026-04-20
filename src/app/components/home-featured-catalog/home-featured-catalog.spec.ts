import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeFeaturedCatalog } from './home-featured-catalog';

describe('HomeFeaturedCatalog', () => {
  let component: HomeFeaturedCatalog;
  let fixture: ComponentFixture<HomeFeaturedCatalog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeFeaturedCatalog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeFeaturedCatalog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
