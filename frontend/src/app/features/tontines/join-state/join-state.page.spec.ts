import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JoinStatePage } from './join-state.page';

describe('JoinStatePage', () => {
  let component: JoinStatePage;
  let fixture: ComponentFixture<JoinStatePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(JoinStatePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
