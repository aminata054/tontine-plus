import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VoteListPage } from './vote-list.page';

describe('VoteListPage', () => {
  let component: VoteListPage;
  let fixture: ComponentFixture<VoteListPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(VoteListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
