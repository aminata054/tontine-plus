import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TontinePaymentPage } from './tontine-payment.page';

describe('TontinePaymentPage', () => {
  let component: TontinePaymentPage;
  let fixture: ComponentFixture<TontinePaymentPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TontinePaymentPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
