import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonCard, IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-selection-card',
  templateUrl: './selection-card.component.html',
  styleUrls: ['./selection-card.component.scss'],
  standalone: true,
  imports: [CommonModule, IonCard, IonIcon],
})
export class SelectionCardComponent {

  @Input() title: string = '';
  @Input() description: string = '';
  @Input() note: string = '';
  @Input() recommended: boolean = false;
  @Input() selected: boolean = false;
  @Input() locked: boolean = false;
  @Input() premium: boolean = false;

  @Output() cardClick = new EventEmitter<void>();
  @Output() selectedChange = new EventEmitter<boolean>();
  @Output() premiumClick = new EventEmitter<void>();

  onCardClick() {
    if (this.locked) {
      this.premiumClick.emit();
      return;
    }
    this.cardClick.emit();

    this.selectedChange.emit(true);
  }
}