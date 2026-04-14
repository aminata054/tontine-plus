import { Component, Input, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent, IonIcon, IonSelect, IonSelectOption,
  ModalController
} from '@ionic/angular/standalone';

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'launch';
export interface SelectableMember { uid: string; name: string; }

@Component({
  selector: 'app-alert-modal',
  templateUrl: './alert-modal.component.html',
  styleUrls: ['./alert-modal.component.scss'],
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [CommonModule, IonContent, IonIcon, IonSelect, IonSelectOption]
})
export class AlertModalComponent {

  @Input() type: AlertType = 'info';
  @Input() title = '';
  @Input() message = '';
  @Input() confirmText = 'Confirmer';
  @Input() cancelText = 'Annuler';
  @Input() confirmColor = 'primary';
  @Input() extraData: { label: string; value: string }[] = [];
  @Input() selectableMembers: SelectableMember[] = [];

  selectedMemberUid: string | null = null;

  constructor(private modalCtrl: ModalController) { }

  get iconName(): string {
    const map: Record<AlertType, string> = {
      success: 'checkmark-circle',
      error: 'close-circle',
      warning: 'alert-circle',
      launch: 'rocket',           
      info: 'information-circle',
    };
    return map[this.type] ?? 'information-circle';
  }

  get canConfirm(): boolean {
    return this.selectableMembers.length > 0 ? !!this.selectedMemberUid : true;
  }

  // Appelé par (ionChange) sur ion-select
  onMemberChange(event: CustomEvent): void {
    this.selectedMemberUid = event.detail.value ?? null;
  }

  onConfirm(): void {
    if (!this.canConfirm) return;
    this.modalCtrl.dismiss({ confirmed: true, selectedMemberUid: this.selectedMemberUid ?? undefined });
  }

  dismiss(): void {
    this.modalCtrl.dismiss({ confirmed: false });
  }
}