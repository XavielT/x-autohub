import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestBadge } from './test-badge';

describe('TestBadge', () => {
  let component: TestBadge;
  let fixture: ComponentFixture<TestBadge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestBadge],
    }).compileComponents();

    fixture = TestBed.createComponent(TestBadge);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('dice PRUEBA', () => {
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('PRUEBA');
  });
});
