import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ReferralStatsModalComponent } from './referral-stats-modal.component';

describe('ReferralStatsModalComponent', () => {
  let component: ReferralStatsModalComponent;
  let fixture: ComponentFixture<ReferralStatsModalComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ReferralStatsModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ReferralStatsModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
