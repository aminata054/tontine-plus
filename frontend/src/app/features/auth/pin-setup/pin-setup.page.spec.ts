import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PinSetupPage } from './pin-setup.page';

describe('PinSetupPage', () => {
  let component: PinSetupPage;
  let fixture: ComponentFixture<PinSetupPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PinSetupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
