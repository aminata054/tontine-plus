import { Component, ViewChildren, QueryList, ElementRef, forwardRef, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-otp-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './otp-input.component.html',
  styleUrls: ['./otp-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => OtpInputComponent),
      multi: true
    }
  ]
})
export class OtpInputComponent implements ControlValueAccessor {

  @Input() length: number = 6;
  @Output() completed = new EventEmitter<string>();

  @ViewChildren('otpInput') inputs!: QueryList<ElementRef<HTMLInputElement>>;

  digits: string[] = [];

  private onChange: any = () => { };
  private onTouched: any = () => { };

  constructor() {
    this.digits = Array(this.length).fill('');
  }

  // TrackBy pour éviter les recréations inutiles d'inputs 
  trackByFn(index: number): number {
    return index;
  }

  // ControlValueAccessor
  writeValue(value: string | null): void {
    const str = value?.toString() || '';
    this.digits = str.split('').slice(0, this.length)
      .concat(Array(this.length - str.length).fill(''));
  }

  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }

  onDigitChange(newValue: string, index: number) {
    const digit = newValue ? newValue.slice(-1) : '';
    this.digits[index] = digit;

    const code = this.digits.join('');
    this.onChange(code);
    this.onTouched();

    if (digit && index < this.length - 1) {
      setTimeout(() => this.focusNext(index), 10);
    }

    if (code.length === this.length) {
      this.completed.emit(code);
    }
  }

  onKeyDown(event: KeyboardEvent, index: number) {
    const input = event.target as HTMLInputElement;

    if (event.key === 'Backspace') {
      if (!this.digits[index] && index > 0) {
        this.focusPrevious(index);
      } else if (this.digits[index]) {
        this.digits[index] = '';           // Efface le chiffre actuel
        this.onChange(this.digits.join(''));
      }
    }
    else if (event.key === 'ArrowLeft' && index > 0) {
      this.focusPrevious(index);
    }
    else if (event.key === 'ArrowRight' && index < this.length - 1) {
      this.focusNext(index);
    }
  }

  onPaste(event: ClipboardEvent) {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    const digitsOnly = pasted.replace(/\D/g, '').slice(0, this.length);

    for (let i = 0; i < digitsOnly.length; i++) {
      this.digits[i] = digitsOnly[i];
    }

    const code = this.digits.join('');
    this.onChange(code);

    if (digitsOnly.length === this.length) {
      this.completed.emit(code);
    } else if (digitsOnly.length > 0) {
      setTimeout(() => this.focusInput(digitsOnly.length), 10);
    }
  }

  private focusNext(index: number) {
    const next = this.inputs.get(index + 1);
    next?.nativeElement.focus();
    next?.nativeElement.select();
  }

  private focusPrevious(index: number) {
    const prev = this.inputs.get(index - 1);
    prev?.nativeElement.focus();
  }

  private focusInput(index: number) {
    const input = this.inputs.get(index);
    input?.nativeElement.focus();
  }
}