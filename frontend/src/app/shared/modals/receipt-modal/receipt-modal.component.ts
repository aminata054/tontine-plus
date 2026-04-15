import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import {
  IonHeader, IonTitle, IonButtons, IonButton,
  IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { Payment } from 'src/app/core/models/payment.model';

@Component({
  selector: 'app-receipt-modal',
  templateUrl: './receipt-modal.component.html',
  styleUrls: ['./receipt-modal.component.scss'],
  imports: [
    CommonModule,
    IonHeader, IonTitle, IonButtons, IonButton,
    IonContent, IonIcon
  ]
})
export class ReceiptModalComponent {

  @Input() payment!: Payment;

  constructor(private modalCtrl: ModalController) { }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  formatAmount(v: number): string {
    return new Intl.NumberFormat('fr-FR').format(v ?? 0);
  }

  formatDate(value: any): string {
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' :
      d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
