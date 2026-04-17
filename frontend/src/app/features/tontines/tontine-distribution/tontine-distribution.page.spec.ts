import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TontineDistributionPage } from './tontine-distribution.page';

describe('TontineDistributionPage', () => {
  let component: TontineDistributionPage;
  let fixture: ComponentFixture<TontineDistributionPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TontineDistributionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
