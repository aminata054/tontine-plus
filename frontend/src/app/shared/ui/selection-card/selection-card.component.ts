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

  @Output() selectedChange = new EventEmitter<boolean>();

  onSelect() {
    this.selectedChange.emit(true);
  }
}