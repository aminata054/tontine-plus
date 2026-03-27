import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-step-indicator',
  templateUrl: './step-indicator.component.html',
  styleUrls: ['./step-indicator.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class StepIndicatorComponent {
  @Input() currentStep: number = 1;
  @Input() totalSteps: number = 4;
  
  get steps() {
    return Array(this.totalSteps).fill(0);
  }
}