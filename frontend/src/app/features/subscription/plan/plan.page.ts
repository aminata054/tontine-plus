import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent, IonIcon,
  ToastController, AlertController,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { SubscriptionService } from 'src/app/core/services/subscription.service';
import { SubscriptionPlan } from 'src/app/core/models/subscription.model';

// ─── Modèles locaux ────────────────────────────────────────

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface Plan {
  id: SubscriptionPlan;
  name: string;
  subtitle: string;
  priceLabel: string;
  badge?: string;
  amount: number;
  currency: string;
  interval: string;
  features: PlanFeature[];
  includedFeatures: string[];
}

export interface PaymentMethod {
  id: string;
  name: string;
  logo: string;
}

type View = 'plans' | 'payment' | 'transaction';

@Component({
  selector: 'app-plan',
  templateUrl: './plan.page.html',
  styleUrls: ['./plan.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    PageHeaderComponent,
    CustomButtonComponent,
  ],
})
export class PlanPage implements OnInit {

  currentView: View = 'plans';
  selectedPlan: Plan | null = null;
  selectedMethod: PaymentMethod | null = null;
  isSubmitting = false;

  // Saisie manuelle du transactionId (numéro de reçu mobile money)
  transactionId = '';
  transactionIdError = '';

  // Bottom sheet
  showFeaturesSheet = false;
  featuredPlan: Plan | null = null;

  // ── Plans ──────────────────────────────────────────────────
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

  // ── Méthodes de paiement ───────────────────────────────────
  paymentMethods: PaymentMethod[] = [
    { id: 'wave', name: 'Wave', logo: 'assets/images/wave-logo.png' },
    { id: 'orange_money', name: 'Orange Money', logo: 'assets/images/orange-money-logo.png' },
    { id: 'kpay', name: 'Kpay', logo: 'assets/images/kpay-logo.png' },
  ];

  constructor(
    private router: Router,
    private subscriptionService: SubscriptionService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
  ) { }

  ngOnInit(): void {
    this.selectedPlan = this.plans[0];
  }

  // ── Vue Plans ──────────────────────────────────────────────

  selectPlan(plan: Plan): void {
    this.selectedPlan = plan;
  }

  openFeatures(plan: Plan): void {
    this.featuredPlan = plan;
    this.showFeaturesSheet = true;
  }

  closeFeaturesSheet(): void {
    this.showFeaturesSheet = false;
  }

  selectFromSheet(): void {
    if (this.featuredPlan) this.selectedPlan = this.featuredPlan;
    this.showFeaturesSheet = false;
    this.goToPayment();
  }

  goToPayment(): void {
    if (!this.selectedPlan) return;
    this.currentView = 'payment';
  }

  goBack(): void {
    if (this.currentView === 'transaction') {
      this.currentView = 'payment';
    } else if (this.currentView === 'payment') {
      this.currentView = 'plans';
    } else {
      this.router.navigate(['/subscription']);
    }
  }

  // ── Vue Paiement ───────────────────────────────────────────

  get selectedPlanIncludedFeatures(): string[] {
    return this.selectedPlan?.includedFeatures ?? [];
  }

  selectMethod(method: PaymentMethod): void {
    this.selectedMethod = method;
  }

  /**
   * Étape 1 : l'utilisateur a payé sur l'app mobile money.
   * On lui demande de saisir son numéro de transaction pour confirmer.
   */
  onConfirmPayment(): void {
    if (!this.selectedPlan || !this.selectedMethod) return;
    this.transactionId = '';
    this.transactionIdError = '';
    this.currentView = 'transaction';
  }

  // ── Vue Transaction (saisie du reçu) ───────────────────────

  onTransactionIdChange(value: string): void {
    this.transactionId = value;
    this.transactionIdError = '';
  }

  async simulateSubscription(planId: SubscriptionPlan): Promise<void> {
    this.subscriptionService.simulateSubscription(planId).subscribe({
      next: async (res) => {
        const toast = await this.toastCtrl.create({
          message: "Abonnement simulé avec succès !",
          duration: 3000,
          position: 'bottom',
          color: 'success',
        });
        await toast.present();
      }
    });
  }

  /**
   * Étape 2 : l'utilisateur soumet son numéro de reçu.
   * On appelle SubscriptionService.activateSubscription().
   */
  async onSubscribe(): Promise<void> {
    if (!this.selectedPlan || !this.selectedMethod || this.isSubmitting) return;

    // Validation locale du transactionId
    const tid = this.transactionId.trim();
    if (!tid || tid.length < 4) {
      this.transactionIdError = 'Veuillez saisir le numéro de transaction de votre reçu';
      return;
    }

    this.isSubmitting = true;

    this.subscriptionService
      .activateSubscription(this.selectedPlan.id, tid)
      .subscribe({
        next: async (res) => {
          this.isSubmitting = false;

          const toast = await this.toastCtrl.create({
            message: res.message,
            duration: 3000,
            position: 'bottom',
            color: 'success',
          });
          await toast.present();

          // Naviguer vers la page abonnement pour voir le récap
          this.router.navigate(['/subscription'], { replaceUrl: true });
        },
        error: async (err) => {
          this.isSubmitting = false;

          const message = err.error?.error ?? 'Une erreur est survenue';

          // Cas particulier : transactionId déjà utilisé
          if (err.status === 409) {
            this.transactionIdError = 'Ce numéro de transaction a déjà été utilisé';
            return;
          }

          const toast = await this.toastCtrl.create({
            message,
            duration: 3500,
            position: 'bottom',
            color: 'danger',
          });
          await toast.present();
        },
      });
  }

  // ── Computed ───────────────────────────────────────────────

  get canProceedToPayment(): boolean {
    return !!this.selectedPlan && !!this.selectedMethod;
  }

  get paymentInstructions(): string {
    if (!this.selectedPlan || !this.selectedMethod) return '';
    const amount = new Intl.NumberFormat('fr-FR').format(this.selectedPlan.amount);
    const method = this.selectedMethod.name;
    return `Envoyez ${amount} XOF via ${method}, puis saisissez ci-dessous le numéro de transaction de votre reçu.`;
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('fr-FR').format(amount);
  }
}