import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent, IonIcon,
  AlertController, ToastController,
} from '@ionic/angular/standalone';
import { Subscription as RxSubscription } from 'rxjs';

import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { SubscriptionService } from 'src/app/core/services/subscription.service';
import { Subscription, SubscriptionStatus } from 'src/app/core/models/subscription.model';

@Component({
  selector: 'app-subscription-list',
  templateUrl: './subscription-list.page.html',
  styleUrls: ['./subscription-list.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    PageHeaderComponent,
    CustomButtonComponent,
  ],
})
export class SubscriptionListPage implements OnInit, OnDestroy {

  subscription: Subscription | null = null;
  loading = true;
  // Distingue une vraie erreur réseau (affichée) d'un simple "pas d'abonnement"
  networkError: string | null = null;
  cancelLoading = false;
  reactivateLoading = false;

  features = [
    { icon: 'people-outline', label: 'Tontines illimitées' },
    { icon: 'infinite-outline', label: 'Membres sans restriction' },
    { icon: 'shield-checkmark-outline', label: 'Sécurité escrow avancée' },
    { icon: 'trending-up-outline', label: 'Statistiques détaillées' },
    { icon: 'star-outline', label: 'Support prioritaire' },
    { icon: 'flash-outline', label: 'Accès aux fonctionnalités premium' },
  ];

  private subs = new RxSubscription();

  constructor(
    private router: Router,
    private subscriptionService: SubscriptionService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
  ) { }

  // ── Cycle de vie ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // S'abonne au BehaviorSubject uniquement pour propager les mises à jour
    // APRES le chargement initial (cancel, reactivate...).
    // Le null initial du BehaviorSubject ne doit PAS écraser la donnée API.
    this.subs.add(
      this.subscriptionService.subscription$.subscribe((sub) => {
        if (!this.loading) {
          this.subscription = sub;
        }
      })
    );

    this.loadSubscription();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  // ── Chargement ────────────────────────────────────────────────────────────────

  loadSubscription(): void {
    this.loading = true;
    this.networkError = null;

    this.subscriptionService.getMySubscription().subscribe({
      next: (res) => {
        // Source de vérité directe — ne pas attendre le BehaviorSubject
        this.subscription = res.data;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;

        if (err.status === 404) {
          // Aucun document subscription en base : utilisateur sans abonnement.
          // C'est un état normal — on affiche le bloc "souscrire".
          this.subscription = null;
        } else {
          // Vraie erreur réseau ou 500 : on l'affiche dans le template.
          this.networkError = err.error?.error ?? "Impossible de charger l'abonnement";
        }
      },
    });
  }

  // ── Computed ──────────────────────────────────────────────────────────────────

  get hasSubscription(): boolean {
    return this.subscription !== null;
  }

  get statusLabel(): string {
    return this.subscriptionService.statusLabel(
      (this.subscription?.effectiveStatus ?? this.subscription?.status) as SubscriptionStatus
    );
  }

  get statusIcon(): string {
    switch (this.subscription?.effectiveStatus ?? this.subscription?.status) {
      case 'active': return 'checkmark-circle-outline';
      case 'trialing': return 'time-outline';
      case 'canceled': return 'close-circle-outline';
      case 'past_due': return 'alert-circle-outline';
      case 'expired': return 'close-circle-outline';
      default: return 'time-outline';
    }
  }

  get statusColor(): string {
    return this.subscriptionService.statusColor(
      (this.subscription?.effectiveStatus ?? this.subscription?.status) as SubscriptionStatus
    );
  }

  get planLabel(): string {
    if (!this.subscription?.plan) return '—';
    return this.subscriptionService.planLabel(this.subscription.plan);
  }

  get paymentMethodLabel(): string {
    switch (this.subscription?.paymentMethod) {
      case 'manual': return 'Manuel';
      case 'mobile_money': return 'Mobile Money';
      default: return this.subscription?.paymentMethod ?? '—';
    }
  }

  get periodProgress(): number {
    if (!this.subscription) return 0;
    const start = this.toDate(this.subscription.currentPeriodStart)?.getTime() ?? 0;
    const end = this.toDate(this.subscription.currentPeriodEnd)?.getTime() ?? 0;
    if (!start || !end || end === start) return 0;
    const pct = ((Date.now() - start) / (end - start)) * 100;
    return Math.min(100, Math.max(0, pct));
  }

  get isTrialing(): boolean {
    return (this.subscription?.effectiveStatus ?? this.subscription?.status) === 'trialing';
  }

  get isCanceling(): boolean {
    return !!this.subscription?.cancelAtPeriodEnd;
  }

  get isExpiredOrCanceled(): boolean {
    const s = this.subscription?.effectiveStatus ?? this.subscription?.status;
    return s === 'expired' || s === 'canceled';
  }

  // ── Actions ───────────────────────────────────────────────────────────────────

  goToSubscribe(): void {
    this.router.navigate(['/plan']);
  }

  async onCancelSubscription(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: "Annuler l'abonnement",
      message: "Voulez-vous garder l'accès jusqu'à la fin de la période en cours, ou résilier immédiatement ?",
      buttons: [
        { text: 'Abandonner', role: 'cancel' },
        { text: 'Fin de période', handler: () => this.confirmCancel(false) },
        { text: 'Immédiatement', role: 'destructive', handler: () => this.confirmCancel(true) },
      ],
    });
    await alert.present();
  }

  private confirmCancel(immediately: boolean): void {
    this.cancelLoading = true;
    this.subscriptionService.cancelSubscription(immediately).subscribe({
      next: async (res) => {
        this.cancelLoading = false;
        const toast = await this.toastCtrl.create({
          message: res.message, duration: 3000, color: 'warning', position: 'bottom',
        });
        await toast.present();
      },
      error: async (err) => {
        this.cancelLoading = false;
        const toast = await this.toastCtrl.create({
          message: err.error?.error ?? 'Une erreur est survenue',
          duration: 3000, color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  async onReactivate(): Promise<void> {
    this.reactivateLoading = true;
    this.subscriptionService.reactivateSubscription().subscribe({
      next: async (res) => {
        this.reactivateLoading = false;
        const toast = await this.toastCtrl.create({
          message: res.message, duration: 3000, color: 'success', position: 'bottom',
        });
        await toast.present();
      },
      error: async (err) => {
        this.reactivateLoading = false;
        const toast = await this.toastCtrl.create({
          message: err.error?.error ?? 'Une erreur est survenue',
          duration: 3000, color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  // ── Formatage ─────────────────────────────────────────────────────────────────

  toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value === 'string') return new Date(value);
    // Firestore Timestamp sérialisé en JSON : { _seconds, _nanoseconds }
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
    return null;
  }

  formatDate(value: any): string {
    const date = this.toDate(value);
    if (!date) return '—';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(date);
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('fr-FR').format(amount);
  }
}