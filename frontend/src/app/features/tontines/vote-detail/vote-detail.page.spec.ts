import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VoteDetailPage } from './vote-detail.page';

describe('VoteDetailPage', () => {
  let component: VoteDetailPage;
  let fixture: ComponentFixture<VoteDetailPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(VoteDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
