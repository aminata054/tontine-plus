import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IonButton, IonSpinner } from '@ionic/angular/standalone';
import { CommonModule } from "@angular/common";

@Component({
  selector: 'app-custom-button',
  standalone: true,
  imports: [IonSpinner, IonButton, CommonModule],
  templateUrl: './custom-button.component.html',
  styleUrls: ['./custom-button.component.scss'],
})
export class CustomButtonComponent {

  @Input() color: string = 'primary';
  @Input() fill: 'solid' | 'outline' | 'clear' = 'solid';
  @Input() expand: 'block' | 'full' = 'block';
  @Input() disabled: boolean = false;
  @Input() loading: boolean = false;
  @Input() height: string = '56px';
  @Input() borderRadius: string = '12px';

  @Output() clicked = new EventEmitter<void>();

  onClick() {
    if (this.disabled || this.loading) return;

    this.clicked.emit();
    console.log('Custom Button clicked!');
  }
}