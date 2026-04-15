import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaymentReceiptsPage } from './payment-receipts.page';

describe('PaymentReceiptsPage', () => {
  let component: PaymentReceiptsPage;
  let fixture: ComponentFixture<PaymentReceiptsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PaymentReceiptsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
