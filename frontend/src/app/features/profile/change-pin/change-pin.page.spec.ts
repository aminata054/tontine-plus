import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangePinPage } from './change-pin.page';

describe('ChangePinPage', () => {
  let component: ChangePinPage;
  let fixture: ComponentFixture<ChangePinPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ChangePinPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
