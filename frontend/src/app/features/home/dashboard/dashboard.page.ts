import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon, IonRefresher, IonRefresherContent, IonSkeletonText, ModalController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { AuthService } from 'src/app/core/services/auth.service';
import { UserProfile } from 'src/app/core/models/auth.model';
import { StateScreenComponent } from 'src/app/shared/ui/state-screen/state-screen.component';
import { Tontine } from 'src/app/core/models/tontine.model';
import { Payment } from 'src/app/core/models/payment.model';
import { catchError, finalize, forkJoin, of, Subject, takeUntil } from 'rxjs';
import { TontineService } from 'src/app/core/services/tontine.service';
import { PaymentService } from 'src/app/core/services/payment.service';
import { SubscriptionService } from 'src/app/core/services/subscription.service';
import { SharePanelComponent } from 'src/app/shared/ui/share-panel/share-panel.component';
import { NotificationService } from 'src/app/core/services/notification.service';

interface UserStats {
  activeTontines: number;
  totalPaid: number;
  turnsReceived: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    IonContent, IonIcon, IonRefresher, IonRefresherContent, IonSkeletonText,
    CommonModule,
    StateScreenComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
})
export class DashboardPage implements OnInit, OnDestroy {

  user: UserProfile | null = null;
  isPremium = false;
  notifCount = 0;
  planLabel = '';

  showSuccessState = false;
  tontines: Tontine[] = [];
  publicTontines: Tontine[] = [];
  recentPayments: Payment[] = [];

  userStats: UserStats = {
    activeTontines: 0,
    totalPaid: 0,
    turnsReceived: 0,
  };

  isLoading = true;
  hasError = false;

  private destroy$ = new Subject<void>();

  constructor(
    private auth: AuthService,
    private router: Router,
    private tontineService: TontineService,
    private paymentService: PaymentService,
    private subscriptionService: SubscriptionService,
    private notificationService: NotificationService,
    private modalCtrl: ModalController,
  ) { }

  ngOnInit(): void {
    this.user = this.auth.currentUser;
    this.auth.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(u => { this.user = u; });

    this.notificationService.unreadCount
      .pipe(takeUntil(this.destroy$))
      .subscribe(count => { this.notifCount = count; });
    this.notificationService.refreshUnreadCount();

    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Chargement ───────────────────────────────────────────────

  private fetchAll() {
    return forkJoin({
      tontines: this.tontineService.getMyTontines().pipe(
        catchError(() => of({ success: true, data: [], count: 0 }))
      ),
      publicTontines: this.tontineService.getPublicTontines().pipe(
        catchError(() => of({ success: true, data: [], count: 0 }))
      ),
      payments: this.paymentService.getMyPayments().pipe(
        catchError(() => of({ success: false, data: [] }))
      ),
      subscription: this.subscriptionService.getMySubscription().pipe(
        catchError(() => of({ success: false, data: null }))
      ),
    });
  }

  private applyData({ tontines, publicTontines, payments, subscription }: any): void {
    // Tontines
    this.tontines = (tontines.data ?? []).slice(0, 3);
    this.publicTontines = (publicTontines.data ?? []).slice(0, 3);

    // Paiements
    const allPayments: Payment[] = payments.success ? payments.data : [];
    this.recentPayments = allPayments
      .filter((p: Payment) => p.status === 'confirmed')
      .slice(0, 3);

    // Abonnement
    const sub = subscription.success ? subscription.data : null;
    this.isPremium = sub?.effectiveStatus === 'active' || sub?.hasAccess === true;
    this.planLabel = sub?.plan
      ? this.subscriptionService.planLabel(sub.plan)
      : '';

    // Stats utilisateur — calculées depuis les données déjà chargées
    const confirmedPayments = allPayments.filter((p: Payment) => p.status === 'confirmed');
    this.userStats = {
      // Tontines actives parmi celles de l'utilisateur
      activeTontines: (tontines.data ?? []).filter(
        (t: Tontine) => (t as any).status === 'active'
      ).length,
      // Total cotisé (paiements confirmés)
      totalPaid: confirmedPayments.reduce(
        (sum: number, p: Payment) => sum + (p.totalAmount ?? 0), 0
      ),
      // Tours reçus = paiements où l'utilisateur était bénéficiaire
      turnsReceived: confirmedPayments.filter(
        (p: Payment) => (p as any).beneficiaryUid === this.user?.uid
          || (p as any).isReceiver === true
      ).length,
    };
  }

  loadAll(): void {
    this.hasError = false;
    this.isLoading = true;

    this.fetchAll()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.isLoading = false; }),
      )
      .subscribe({
        next: (data) => { this.applyData(data); },
        error: () => { this.hasError = true; },
      });
  }

  // ── Pull-to-refresh ──────────────────────────────────────────

  handleRefresh(event: any): void {
    this.fetchAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.applyData(data);
          event.target.complete();
        },
        error: () => { event.target.complete(); },
      });
  }

  // ── Helpers UI ───────────────────────────────────────────────

  onImageError(tontine: Tontine): void { tontine.iconUrl = ''; }

  getInitials(): string {
    if (!this.user?.fullName) return '?';
    return this.user.fullName
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('fr-FR').format(amount);
  }

  formatDate(value: any): string {
    const d = this._toDate(value);
    if (!d) return '—';
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  private _toDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (value._seconds !== undefined) return new Date(value._seconds * 1000);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  // ── Inviter un ami ───────────────────────────────────────────

  async inviteFriend(): Promise<void> {
    let shareText: string;
    let shareUrl: string;
    try {
      const response = await this.auth.getReferralLink();
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

  // ── Navigation ───────────────────────────────────────────────

  goToProfile(): void { this.router.navigate(['/profile']); }
  openNotifications(): void { this.router.navigate(['/notification-page']); }
  goToPremium(): void { this.router.navigate(['/subscription-list']); }
  seeAllTontines(): void { this.router.navigate(['/tontines']); }
  seeAllPublicTontines(): void { this.router.navigate(['/tontines/public']); }
  seeAllReceipts(): void { this.router.navigate(['/profile/receipts']); }
  openTontine(t: Tontine): void { this.router.navigate(['/tontines', t.id, 'overview']); }
  joinPublicTontine(t: Tontine): void { this.router.navigate(['/join', t.id]); }
  createTontine(): void { this.router.navigate(['/tontines/create']); }
  joinTontine(): void { this.router.navigate(['/tontines/join']); }
}