import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  IonContent, IonIcon, IonSkeletonText, ToastController, AlertController, ModalController
} from '@ionic/angular/standalone';

import { UserProfile } from 'src/app/core/models/auth.model';
import { AuthService } from 'src/app/core/services/auth.service';
import { SubscriptionService } from 'src/app/core/services/subscription.service';
import { Subscription } from 'src/app/core/models/subscription.model';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { SharePanelComponent } from 'src/app/shared/ui/share-panel/share-panel.component';
import { ReferralStatsModalComponent } from 'src/app/shared/modals/referral-stats-modal/referral-stats-modal.component';

type PageStatus = 'loading' | 'success' | 'error';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonIcon, IonSkeletonText,
    PageHeaderComponent,
  ],
})
export class ProfilePage implements OnInit, OnDestroy {

  status: PageStatus = 'loading';
  user: UserProfile | null = null;
  referralStats: any = null;
  referralStatsLoading = true;

  // ── Abonnement ──────────────────────────────────────────────
  subscription: Subscription | null = null;
  subscriptionLoading = true;

  showContactSheet = false;
  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private modalCtrl: ModalController,
  ) { }

  ngOnInit(): void {
    this.load();
    this.loadSubscription();
    this.loadReferralStats();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Chargement profil ────────────────────────────────────────

  load(): void {
    this.status = 'loading';
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (user) => {
          if (user) {
            this.user = user;
            this.status = 'success';
          } else {
            if (this.status === 'loading') {
              setTimeout(() => {
                const current = this.authService.currentUser;
                if (current) {
                  this.user = current;
                  this.status = 'success';
                } else {
                  this.status = 'error';
                }
              }, 800);
            }
          }
        },
        error: () => { this.status = 'error'; },
      });
  }

  // ── Chargement abonnement ────────────────────────────────────

  loadSubscription(): void {
    this.subscriptionLoading = true;
    this.subscriptionService.getMySubscription()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.subscription = res.success ? res.data : null;
          this.subscriptionLoading = false;
        },
        error: () => {
          this.subscription = null;
          this.subscriptionLoading = false;
        },
      });
  }

  loadReferralStats(): void {
    this.referralStatsLoading = true;
    this.authService.getReferralStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.referralStats = res.success ? res.data : null;
          this.referralStatsLoading = false;
        },
        error: () => {
          this.referralStats = null;
          this.referralStatsLoading = false;
        },
      });
  }

  async openReferralModal(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ReferralStatsModalComponent,
      componentProps: {
        referralStats: this.referralStats,
        referralStatsLoading: this.referralStatsLoading,
      },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
      backdropDismiss: true,
      cssClass: 'panel-modal',
    });

    modal.onDidDismiss().then(({ data }) => {
      // Si l'utilisateur clique "Inviter" depuis le modal
      if (data?.action === 'invite') {
        this.inviteFriend();
      }
    });

    await modal.present();
  }

  // Texte du slot restant pour le template
  get referralSlotsLabel(): string {
    if (!this.referralStats) return '';
    const r = this.referralStats.remainingSlots;
    if (r === 0) return 'Limite atteinte';
    return `${r} invitation${r > 1 ? 's' : ''} restante${r > 1 ? 's' : ''}`;
  }

  // ── Computed : état de l'abonnement ─────────────────────────

  get isActiveSubscriber(): boolean {
    if (!this.subscription) return false;
    const s = this.subscription as any;
    return s.effectiveStatus === 'active' || s.hasAccess === true;
  }

  get isTrial(): boolean {
    const s = this.subscription as any;
    return s?.effectiveStatus === 'trialing';
  }

  get planLabel(): string {
    if (!this.subscription) return '';
    return this.subscriptionService.planLabel((this.subscription as any).plan);
  }

  get daysRemaining(): number | null {
    return (this.subscription as any)?.daysRemaining ?? null;
  }

  get periodEndFormatted(): string {
    const end = (this.subscription as any)?.currentPeriodEnd;
    if (!end) return '';
    const date = end?.toDate ? end.toDate() : new Date(end);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ── Reste des méthodes (inchangées) ──────────────────────────

  async inviteFriend(): Promise<void> {
    let shareText: string;
    let shareUrl: string;
    try {
      const response = await this.authService.getReferralLink();
      shareText = response.data.shareText;
      shareUrl = response.data.referralLink;
    } catch {
      const code = this.user?.referralCode ?? '';
      shareUrl = `https://tontineplus.app/register?ref=${code}`;
      shareText = `Rejoins Tontine Plus avec mon code ${code}`;
    }
    const modal = await this.modalCtrl.create({
      component: SharePanelComponent,
      componentProps: { link: shareUrl, title: 'Inviter un ami', shareText },
      breakpoints: [0, 0.5, 0.8],
      initialBreakpoint: 0.5,
      backdropDismiss: true,
      cssClass: 'panel-modal',
    });
    await modal.present();
  }

  contactSupport(): void { this.showContactSheet = true; }
  closeContactSheet(): void { this.showContactSheet = false; }

  contactViaWhatsapp(): void {
    this.closeContactSheet();
    window.open(`https://wa.me/+221XXXXXXXXX`, '_blank');
  }

  contactViaCall(): void {
    this.closeContactSheet();
    window.open('tel:+221XXXXXXXXX');
  }

  async logout(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Déconnexion',
      message: 'Êtes-vous sûr de vouloir vous déconnecter ?',
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        {
          text: 'Déconnexion', role: 'destructive',
          handler: async () => {
            await this.authService.logout();
            this.router.navigate(['/register'], { replaceUrl: true });
          },
        },
      ],
    });
    await alert.present();
  }

  getInitials(name: string | null | undefined): string {
    return (name ?? '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  }

  goToMyAccount(): void { this.router.navigate(['/profile/account']); }
  goToChangePin(): void { this.router.navigate(['/profile/change-pin']); }
  goToSubscription(): void { this.router.navigate(['/subscription-list']); }
  goToHelpCenter(): void { this.router.navigate(['/profile/help-center']); }
  goToAbout(): void { this.router.navigate(['/profile/about']); }
  goToFeedback(): void { this.router.navigate(['/profile/feedback']); }
  goToMyReceipts(): void { this.router.navigate(['/profile/receipts']); }

}