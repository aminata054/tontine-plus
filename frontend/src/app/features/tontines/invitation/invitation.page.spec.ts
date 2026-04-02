import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InvitationPage } from './invitation.page';

describe('InvitationPage', () => {
  let component: InvitationPage;
  let fixture: ComponentFixture<InvitationPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(InvitationPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
