import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OtpPagePage } from './otp-page.page';

describe('OtpPagePage', () => {
  let component: OtpPagePage;
  let fixture: ComponentFixture<OtpPagePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(OtpPagePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
