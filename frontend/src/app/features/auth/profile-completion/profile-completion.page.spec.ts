import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProfileCompletionPage } from './profile-completion.page';

describe('ProfileCompletionPage', () => {
  let component: ProfileCompletionPage;
  let fixture: ComponentFixture<ProfileCompletionPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ProfileCompletionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
