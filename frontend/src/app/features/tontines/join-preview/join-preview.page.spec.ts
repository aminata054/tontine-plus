import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JoinPreviewPage } from './join-preview.page';

describe('JoinPreviewPage', () => {
  let component: JoinPreviewPage;
  let fixture: ComponentFixture<JoinPreviewPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(JoinPreviewPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
