import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { IonInput, IonLabel } from '@ionic/angular/standalone';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-custom-input',
  standalone: true,
  imports: [IonInput, IonLabel, FormsModule, ReactiveFormsModule, CommonModule],
  templateUrl: './custom-input.component.html',
  styleUrls: ['./custom-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomInputComponent),
      multi: true
    }
  ]
})
export class CustomInputComponent implements ControlValueAccessor {

  @Input() label: string = '';
  @Input() value: string = '';
  @Output() valueChange = new EventEmitter<string>();
  @Input() type: string = 'text';
  @Input() placeholder: string = '';
  @Input() disabled: boolean = false;
  @Input() size: 'small' | 'default' = 'default';
  @Input() errorMessage: string = '';
  @Input() readonly: boolean = false;

  @Input() ngModel?: any;
  @Input() ngModelChange?: any;

  onChange: any = () => { };
  onTouched: any = () => { };

  writeValue(value: any): void {
    this.value = value || '';
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: any) {
    const val = event.target.value;
    this.value = val;
    this.valueChange.emit(val);
  }

}