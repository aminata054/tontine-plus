import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { DotIndicatorComponent } from './dot-indicator.component';

describe('DotIndicatorComponent', () => {
  let component: DotIndicatorComponent;
  let fixture: ComponentFixture<DotIndicatorComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [DotIndicatorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DotIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
