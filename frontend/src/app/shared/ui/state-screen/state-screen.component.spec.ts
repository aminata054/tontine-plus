import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { StateScreenComponent } from './state-screen.component';

describe('StateScreenComponent', () => {
  let component: StateScreenComponent;
  let fixture: ComponentFixture<StateScreenComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [StateScreenComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StateScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
