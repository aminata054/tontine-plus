import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlowPage } from './flow.page';

describe('FlowPage', () => {
  let component: FlowPage;
  let fixture: ComponentFixture<FlowPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(FlowPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
