import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HelpCenterPage } from './help-center.page';

describe('HelpCenterPage', () => {
  let component: HelpCenterPage;
  let fixture: ComponentFixture<HelpCenterPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(HelpCenterPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
