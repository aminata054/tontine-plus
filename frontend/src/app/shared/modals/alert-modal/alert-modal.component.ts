import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular';

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'launch';

@Component({
  selector: 'app-alert-modal',
  templateUrl: './alert-modal.component.html',
  styleUrls: ['./alert-modal.component.scss'],
  standalone: true,
  imports: [IonContent, IonIcon, CommonModule]
})
export class AlertModalComponent {

  @Input() type: AlertType = 'info';
  @Input() title: string = '';
  @Input() message: string = '';
  @Input() confirmText: string = 'Confirmer';
  @Input() cancelText: string = 'Annuler';
  @Input() confirmColor: string = 'primary';   // 'danger', 'success', 'primary'

  // Pour le cas "Lancer la tontine"
  @Input() extraData: { label: string; value: string }[] = [];

  constructor(private modalCtrl: ModalController) { }

  get iconName(): string {
    switch (this.type) {
      case 'success': return 'checkmark-circle';
      case 'error': return 'close-circle';
      case 'warning': return 'alert-circle';
      case 'launch': return 'checkmark-circle';
      default: return 'information-circle';
    }
  }

  onConfirm() {
    this.modalCtrl.dismiss({ confirmed: true });
  }

  dismiss() {
    this.modalCtrl.dismiss({ confirmed: false });
  }
}