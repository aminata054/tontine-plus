import { Component, inject, Input } from '@angular/core';
import {
  IonHeader, IonTitle, IonButtons, IonButton,
  IonContent, IonIcon, ModalController, IonRadio
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { CustomButtonComponent } from '../../ui/custom-button/custom-button.component';
import { Router } from '@angular/router';
import { Plan } from 'src/app/features/subscription/plan/plan.page'; // ← importer le type

@Component({
  selector: 'app-premium-modal',
  templateUrl: './premium-modal.component.html',
  styleUrls: ['./premium-modal.component.scss'],
  standalone: true,
  imports: [IonRadio, CommonModule, IonHeader, IonTitle, IonButtons, IonButton, IonContent, IonIcon, CustomButtonComponent]
})
export class PremiumModalComponent {

  private modalCtrl = inject(ModalController);
  private router = inject(Router);

  @Input() title: string = 'Fonctionnalité Premium';

  // ── Plans identiques à PlanPage ───────────────────────────
  plans: Plan[] = [
    {
      id: 'annual',
      name: 'Annuel',
      subtitle: 'Inclut toutes les fonctionnalités avancées',
      priceLabel: '20 000 FCFA/an',
      badge: '50% off',
      amount: 20000,
      currency: 'XOF',
      interval: 'year',
      includedFeatures: [
        'Création de + de 3 tontines',
        'Maximisation du montant de la tontine',
        'Historique et relevé détaillés',
      ],
      features: [
        { label: 'Création de + de 3 tontines', included: true },
        { label: 'Maximisation du montant de la tontine', included: true },
        { label: 'Historique et relevé détaillés', included: true },
        { label: 'Ordre de tour personnalisé', included: true },
        { label: 'Frais de transaction sur gros montants', included: false },
      ],
    },
    {
      id: 'monthly',
      name: 'Mensuel',
      subtitle: 'Idéal pour commencer',
      priceLabel: '2 000 FCFA/mois',
      amount: 2000,
      currency: 'XOF',
      interval: 'month',
      includedFeatures: [
        'Création de + de 3 tontines',
        'Maximisation du montant de la tontine',
        'Historique et relevé détaillés',
      ],
      features: [
        { label: 'Création de + de 3 tontines', included: true },
        { label: 'Maximisation du montant de la tontine', included: true },
        { label: 'Historique et relevé détaillés', included: true },
        { label: 'Ordre de tour personnalisé', included: false },
        { label: 'Frais de transaction sur gros montants', included: false },
      ],
    },
    {
      id: 'premium',
      name: 'Premium',
      subtitle: 'Pour les power users',
      priceLabel: '5 000 FCFA/mois',
      amount: 5000,
      currency: 'XOF',
      interval: 'month',
      includedFeatures: [
        'Création de + de 3 tontines',
        'Maximisation du montant de la tontine',
        'Historique et relevé détaillés',
        'Ordre de tour personnalisé',
      ],
      features: [
        { label: 'Création de + de 3 tontines', included: true },
        { label: 'Maximisation du montant de la tontine', included: true },
        { label: 'Historique et relevé détaillés', included: true },
        { label: 'Ordre de tour personnalisé', included: true },
        { label: 'Frais de transaction sur gros montants', included: true },
      ],
    },
  ];

  selectedPlan: Plan = this.plans[0]; // annuel par défaut

  selectPlan(plan: Plan): void {
    this.selectedPlan = plan;
  }

  async dismiss(): Promise<void> {
    await this.modalCtrl.dismiss();
  }

  async subscribe(): Promise<void> {
    await this.modalCtrl.dismiss({ action: 'subscribe', plan: this.selectedPlan.id });
    this.router.navigate(['/plan'], { queryParams: { plan: this.selectedPlan.id } });
  }
}