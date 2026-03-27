import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dot-indicator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dot-indicator.component.html',
  styleUrls: ['./dot-indicator.component.scss'],
})
export class DotIndicatorComponent {
  @Input() total: number = 3;
  @Input() current: number = 0;

  get dots(): number[] {
    return Array.from({ length: this.total }, (_, i) => i);
  }
}