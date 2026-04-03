import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TontineDetailPage } from './tontine-detail.page';

describe('TontineDetailPage', () => {
  let component: TontineDetailPage;
  let fixture: ComponentFixture<TontineDetailPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TontineDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
