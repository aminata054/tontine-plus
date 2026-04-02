import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MemberProfilePage } from './member-profile.page';

describe('MemberProfilePage', () => {
  let component: MemberProfilePage;
  let fixture: ComponentFixture<MemberProfilePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MemberProfilePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
