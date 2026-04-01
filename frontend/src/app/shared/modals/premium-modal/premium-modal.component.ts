import { Component, inject, Input } from '@angular/core';
import {
  IonHeader, IonTitle, IonButtons, IonButton,
  IonContent, IonIcon, ModalController, IonRadio
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { CustomButtonComponent } from '../../ui/custom-button/custom-button.component';

@Component({
  selector: 'app-premium-modal',
  templateUrl: './premium-modal.component.html',
  styleUrls: ['./premium-modal.component.scss'],
  standalone: true,
  imports: [IonRadio, CommonModule, IonHeader, IonTitle, IonButtons, IonButton, IonContent, IonIcon, CustomButtonComponent]
})

export class PremiumModalComponent {

  private modalCtrl = inject(ModalController);

  @Input() title: string = 'Fonctionnalité Premium';

  selectedPlan: 'annual' | 'monthly' | 'premium' = 'annual'; 

  selectPlan(plan: 'annual' | 'monthly' | 'premium') {
    this.selectedPlan = plan;
  }

  async dismiss() {
    await this.modalCtrl.dismiss();
  }

  async subscribe() {
    console.log('Abonnement choisi :', this.selectedPlan);
    // Logique de paiement ici
    await this.modalCtrl.dismiss({ action: 'subscribe', plan: this.selectedPlan });
  }
}