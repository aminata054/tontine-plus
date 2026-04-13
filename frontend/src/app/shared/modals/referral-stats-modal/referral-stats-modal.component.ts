import { Component, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonTitle, IonButtons, IonButton,
  IonContent, IonIcon, IonSkeletonText, ModalController
} from '@ionic/angular/standalone';


@Component({
  selector: 'app-referral-stats-modal',
  templateUrl: './referral-stats-modal.component.html',
  styleUrls: ['./referral-stats-modal.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonTitle, IonButtons, IonButton,
    IonContent, IonIcon, IonSkeletonText
  ]
})
export class ReferralStatsModalComponent {

  private modalCtrl = inject(ModalController);

  @Input() referralStats: any = null;
  @Input() referralStatsLoading = false;
  @Input() onInvite?: () => void; // callback vers ProfilePage

  constructor() {
  }

  get referralSlotsLabel(): string {
    if (!this.referralStats) return '';
    const r = this.referralStats.remainingSlots;
    if (r === 0) return 'Limite atteinte';
    return `${r} invitation${r > 1 ? 's' : ''} restante${r > 1 ? 's' : ''}`;
  }

  inviteFriend(): void {
    this.modalCtrl.dismiss({ action: 'invite' });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}