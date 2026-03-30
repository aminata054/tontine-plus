import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SubscriptionListPage } from './subscription-list.page';

describe('SubscriptionListPage', () => {
  let component: SubscriptionListPage;
  let fixture: ComponentFixture<SubscriptionListPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SubscriptionListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
