import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TontinePage } from './tontine.page';

describe('TontinePage', () => {
  let component: TontinePage;
  let fixture: ComponentFixture<TontinePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TontinePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
