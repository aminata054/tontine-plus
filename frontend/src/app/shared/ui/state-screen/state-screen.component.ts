import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CustomButtonComponent } from '../custom-button/custom-button.component';

export type StateType = 'success' | 'error' | 'celebration' | 'waiting' | 'empty';

@Component({
  selector: 'app-state-screen',
  standalone: true,
  imports: [CommonModule, CustomButtonComponent],
  templateUrl: './state-screen.component.html',
  styleUrls: ['./state-screen.component.scss']
})
export class StateScreenComponent {

  @Input() type: StateType = 'success';
  @Input() title: string = '';
  @Input() subtitle: string = '';
  @Input() buttonText: string = '';
  @Input() secondaryText: string = '';

  @Input() showSecondaryButton = false;
  @Input() secondaryButtonText = '';
  @Input() secondaryButtonFill: 'solid' | 'outline' = 'outline';

  @Input() showDivider = false;          
  @Input() dividerText = 'Ou';

  @Output() secondaryButtonClick = new EventEmitter<void>();

  @Output() buttonClick = new EventEmitter<void>();
  @Output() secondaryClick = new EventEmitter<void>();

  getIconFile(): string {
    switch (this.type) {
      case 'success': return 'successmark.svg';
      case 'error': return 'error.svg';
      case 'celebration': return 'celebration.svg';
      case 'waiting': return 'waiting.svg';
      case 'empty': return 'empty.svg';
      default: return 'success.svg';
    }
  }

  onButtonClick() {
    this.buttonClick.emit();
  }

  onSecondaryClick() {
    this.secondaryClick.emit();
  }

  onSecondaryButtonClick() {
    this.secondaryButtonClick.emit();
  }
}