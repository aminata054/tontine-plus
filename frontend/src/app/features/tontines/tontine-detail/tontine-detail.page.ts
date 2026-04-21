import { Component, OnInit, OnDestroy, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import {
  IonContent, IonIcon, IonSkeletonText, ToastController, ModalController, AlertController
} from '@ionic/angular/standalone';

import {
  HistoryEntry, MyContribution, PageStats,
  Tontine, TontineMember, TurnItem
} from 'src/app/core/models/tontine.model';
import { TontineService } from 'src/app/core/services/tontine.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { PaymentService } from 'src/app/core/services/payment.service';
import { ReceiptModalComponent } from 'src/app/shared/modals/receipt-modal/receipt-modal.component';
import { DistributionService } from 'src/app/core/services/distribution.service';
import { Distribution } from 'src/app/core/models/distribution.model';

type PageStatus = 'loading' | 'success' | 'error';
type TabKey = 'flux' | 'tour' | 'historiques' | 'parametres';

@Component({
  selector: 'app-tontine-detail',
  templateUrl: './tontine-detail.page.html',
  styleUrls: ['./tontine-detail.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonIcon, IonSkeletonText,
    PageHeaderComponent,
    CustomButtonComponent,
  ],
})
export class TontineDetailPage implements OnInit, OnDestroy, AfterViewChecked {

  status: PageStatus = 'loading';
  tontine: Tontine | null = null;
  tontineId: string | null = null;

  // ── Paiements du membre ────────────────────────────────
  myPayments: any[] = [];

  // ── Paiement du tour courant spécifiquement ────────────
  // FIX : on stocke séparément le paiement confirmé du tour EN COURS
  // pour ne pas afficher le reçu du tour 1 au tour 2
  currentTurnPayment: any | null = null;

  activeTab: TabKey = 'flux';
  private donutDrawn = false;
  isAdminOrCreator = false;
  isBeneficiary = false;
  pendingDistribution: Distribution | null = null;
  isConfirmingReception = false;

  tabs: { key: TabKey; label: string }[] = [
    { key: 'flux', label: 'Flux' },
    { key: 'tour', label: 'Tour' },
    { key: 'historiques', label: 'Historiques' },
    { key: 'parametres', label: 'Paramètres' },
  ];

  turns: TurnItem[] = [];
  myContribution: MyContribution | null = null;
  historyEntries: HistoryEntry[] = [];

  stats: PageStats = {
    totalCollected: 0,
    currentBeneficiary: '—',
    nextDate: null,
    paidCount: 0,
    unpaidCount: 0,
    punctualityRate: 0,
    completedTurns: 0,
    nextDueLabel: '—',
  };

  private allMembers: TontineMember[] = [];
  private destroy$ = new Subject<void>();
  uid: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tontineService: TontineService,
    private paymentService: PaymentService,
    private authService: AuthService,
    private distributionService: DistributionService,
    private toastCtrl: ToastController,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
  ) { }

  ngOnInit(): void {
    this.uid = this.authService.currentUser?.uid ?? null;
    this.tontineId = this.route.snapshot.paramMap.get('id');
    if (!this.tontineId) { this.status = 'error'; return; }
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewChecked(): void {
    if (this.activeTab === 'historiques' && !this.donutDrawn) {
      this.drawDonut();
    }
    if (this.activeTab !== 'historiques') {
      this.donutDrawn = false;
    }
  }

  // ════════════════════════════════════════════════════════
  // CHARGEMENT
  // ════════════════════════════════════════════════════════

  load(): void {
    this.status = 'loading';

    this.tontineService.getTontineById(this.tontineId!)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { if (this.status === 'loading') this.status = 'error'; })
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.tontine = res.data;
            this.status = 'success';
            this.loadMembersAndBuild();
          } else {
            this.status = 'error';
          }
        },
        error: () => { this.status = 'error'; },
      });
  }

  private loadMembersAndBuild(): void {
    if (!this.tontineId) return;

    this.tontineService.getTontineMembers(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (!res.success || !this.tontine) return;

          this.allMembers = res.data.filter(m => m.status === 'active');
          this.buildTimeline();
          this.buildStats();

          this.isAdminOrCreator =
            this.tontine.myRole === 'creator' || this.tontine.myRole === 'admin';

          // UTILISER myTurnNumber depuis la tontine ───────────────────────────
          
          const myTurnNumber = (this.tontine as any).myTurnNumber ?? null;
          this.isBeneficiary = myTurnNumber !== null
            && myTurnNumber === this.tontine.currentTurn;

          this.loadMyPayments();
          if (this.isAdminOrCreator) this.loadDistributionHistory();
          this.loadPendingDistribution();
        },
      });
  }

  // ════════════════════════════════════════════════════════
  // FIX — CHARGEMENT DES PAIEMENTS DU MEMBRE
  //
  // Problème précédent : loadMyPayments() prenait le DERNIER paiement
  // de la liste sans vérifier le turnNumber, donc le reçu du tour 1
  // s'affichait encore au tour 2.
  //
  // Correction : on filtre explicitement sur le turnNumber du tour courant.
  // Si un paiement confirmé existe pour CE tour → status = 'paid'
  // Sinon → on applique la logique due/late normale.
  // ════════════════════════════════════════════════════════

  loadMyPayments(): void {
    if (!this.tontineId || !this.tontine) return;

    this.paymentService.getMyPayments(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        if (!res.success) {
          // Si l'appel échoue, construire myContribution sans les paiements
          this.buildMyContribution(null);
          return;
        }

        this.myPayments = res.data;

        // ── FIX PRINCIPAL ──────────────────────────────────────────────────────
        // Chercher un paiement CONFIRMÉ pour le tour COURANT spécifiquement
        const currentTurn = this.tontine!.currentTurn;

        this.currentTurnPayment = this.myPayments.find(
          p => p.turnNumber === currentTurn && p.status === 'confirmed'
        ) ?? null;

        // Construire myContribution en passant le résultat
        this.buildMyContribution(this.currentTurnPayment);
      });
  }

  // ════════════════════════════════════════════════════════
  // FIX — buildMyContribution avec paiement du tour courant
  //
  // Reçoit directement le paiement confirmé du tour courant
  // (ou null si pas encore payé) au lieu de deviner via myStats.
  // ════════════════════════════════════════════════════════

  private buildMyContribution(currentTurnPmt: any | null): void {
    if (!this.tontine) { this.myContribution = null; return; }

    // Tontine non active → pas de cotisation à afficher
    if (this.tontine.status !== 'active' || this.tontine.currentTurn === 0) {
      this.myContribution = null;
      return;
    }

    // ── CAS 1 : paiement confirmé trouvé pour CE tour ─────────────────────────
    if (currentTurnPmt) {
      this.myContribution = {
        status: 'paid',
        paidAt: currentTurnPmt.confirmedAt ?? currentTurnPmt.paidAt,
        paymentId: currentTurnPmt.id,
        receiptRef: currentTurnPmt.transactionId ?? null,
        receiptUrl: currentTurnPmt.receiptUrl ?? null,
      };
      return;
    }

    // ── CAS 2 : paiement en cours (pending) pour ce tour ─────────────────────
    const pendingPayment = this.myPayments.find(
      p => p.turnNumber === this.tontine!.currentTurn && p.status === 'pending'
    );
    if (pendingPayment) {
      // Traiter comme "à payer" — le paiement est en cours de vérification
      this.myContribution = {
        status: 'due',
        dueDate: this.tontine.nextPaymentDate,
        timeLeft: this.computeTimeLeft(this.tontine.nextPaymentDate),
      };
      return;
    }

    // ── CAS 3 : pas encore payé ce tour → vérifier retard ────────────────────
    const daysLate = this.computeDaysLate();
    const gracePeriod = this.tontine.rules?.gracePeriodDays ?? 0;
    const effectiveDaysLate = Math.max(0, daysLate - gracePeriod);

    if (effectiveDaysLate > 0) {
      // En retard
      const penaltyRate = this.tontine.rules?.penaltyValue ?? 0;
      const penaltyType = this.tontine.rules?.penaltyType ?? 'percentage';
      const base = this.tontine.amount;

      let penalty = 0;
      if (penaltyType === 'percentage') {
        penalty = Math.round(base * (penaltyRate / 100) * effectiveDaysLate);
      } else {
        penalty = penaltyRate * effectiveDaysLate;
      }

      this.myContribution = {
        status: 'late',
        dueDate: this.tontine.nextPaymentDate,
        penalty,
        totalDue: base + penalty,
        daysLate: effectiveDaysLate,
      };
    } else {
      // À payer, dans les temps
      this.myContribution = {
        status: 'due',
        dueDate: this.tontine.nextPaymentDate,
        timeLeft: this.computeTimeLeft(this.tontine.nextPaymentDate),
      };
    }
  }

  private loadPendingDistribution(): void {
    if (!this.tontineId || !this.tontine) return;

    const currentDistributionId = (this.tontine as any).currentDistributionId;

    if (currentDistributionId) {
      this.distributionService
        .getOne(currentDistributionId, this.tontineId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res) => {
            if (res.success) {
              if (['sent', 'partial'].includes(res.data.status)) {
                this.pendingDistribution = res.data;
              } else {
                this.pendingDistribution = null;
              }
            }
            // Reconstruire la timeline avec le bon état isDone
            this.buildTimeline();
          },
        });
      return;
    }

    this.distributionService
      .getByTontine(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (!res.success) return;
          this.pendingDistribution = res.data.find(
            d => d.turnNumber === this.tontine!.currentTurn
              && ['sent', 'partial'].includes(d.status)
          ) ?? null;
          // Reconstruire la timeline avec le bon état isDone
          this.buildTimeline();
        },
      });
  }


  async confirmReceptionInline(): Promise<void> {
    if (!this.pendingDistribution || !this.tontineId || this.isConfirmingReception) return;

    // Demander confirmation
    const alert = await this.alertCtrl.create({
      header: 'Confirmer la réception',
      message: `Confirmez-vous avoir reçu ${this.formatAmount(this.pendingDistribution.amount)} FCFA via ${this.pendingDistribution.distributionMethod} ?`,
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        {
          text: 'Oui, je confirme',
          handler: () => this._doConfirmReception(),
        },
      ],
    });
    await alert.present();
  }

  private _doConfirmReception(): void {
    if (!this.pendingDistribution || !this.tontineId) return;
    this.isConfirmingReception = true;

    this.distributionService.confirm({
      distributionId: this.pendingDistribution.id,
      tontineId: this.tontineId,
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async (res) => {
          this.isConfirmingReception = false;

          if (!res.success) {
            const t = await this.toastCtrl.create({
              message: res.message ?? 'Erreur lors de la confirmation',
              duration: 3500, position: 'bottom', color: 'danger',
            });
            await t.present();
            return;
          }

          this.pendingDistribution = null;

          const message = res.data.tontineCompleted
            ? '🏆 Réception confirmée ! La tontine est terminée.'
            : `✅ Réception confirmée ! Le tour ${res.data.nextTurnNumber} a démarré.`;

          const t = await this.toastCtrl.create({
            message,
            duration: 4000,
            position: 'bottom',
            color: 'success',
          });
          await t.present();

          // Recharger la page pour refléter le nouveau tour
          this.load();
        },
        error: async () => {
          this.isConfirmingReception = false;
          const t = await this.toastCtrl.create({
            message: 'Erreur lors de la confirmation',
            duration: 3500, position: 'bottom', color: 'danger',
          });
          await t.present();
        },
      });
  }

  // ════════════════════════════════════════════════════════
  // DISTRIBUTION — REFRESH AUTOMATIQUE APRÈS CONFIRMATION
  //
  // Quand on revient sur cette page après qu'une distribution
  // a été confirmée (tour suivant démarré), on recharge tout.
  // En Ionic, ionViewWillEnter est déclenché à chaque retour
  // de page (navigation back ou pop).
  // ════════════════════════════════════════════════════════

  ionViewWillEnter(): void {
    // Recharger si la page est déjà initialisée (retour depuis distribution)
    if (this.tontineId && this.status === 'success') {
      this.load();
    }
  }

  // ════════════════════════════════════════════════════════
  // HISTORIQUE DISTRIBUTIONS
  // ════════════════════════════════════════════════════════

  private loadDistributionHistory(): void {
    if (!this.tontineId) return;

    this.distributionService.getByTontine(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (!res.success) return;

          this.historyEntries = res.data.map(d => ({
            date: d.distributedAt ?? d.createdAt,
            description: `Distribution tour ${d.turnNumber}`,
            turnNumber: d.turnNumber,
            beneficiary: d.beneficiaryName,
            amount: d.amount,
            method: this.distributionService.getMethodConfig(d.distributionMethod)?.label
              ?? d.distributionMethod,
            transactionId: d.transactionId,
            status: this.distributionService.statusLabel(d.status),
            expanded: false,
          }));
        },
      });
  }

  // ════════════════════════════════════════════════════════
  // TIMELINE (FLUX)
  // ════════════════════════════════════════════════════════

  private buildTimeline(): void {
    if (!this.tontine) return;

    const referenceDate = this.toDate(
      this.tontine.startedAt ?? this.tontine.nextPaymentDate
    );

    // Un tour est "terminé" si son numéro est < currentTurn
    // OU si son numéro === currentTurn ET qu'une distribution received existe pour lui
    const currentTurnIsReceived = this.pendingDistribution === null
      && (this.tontine as any).currentDistributionId != null;

    this.turns = this.allMembers
      .filter(m => m.turnNumber != null)
      .sort((a, b) => (a.turnNumber ?? 0) - (b.turnNumber ?? 0))
      .map(m => {
        const estimatedDate = this.computeTurnDate(
          referenceDate,
          m.turnNumber!,
          this.tontine!.frequency
        );

        const isCurrent = m.turnNumber === this.tontine!.currentTurn
          && !currentTurnIsReceived;

        const isDone = (m.turnNumber ?? 0) < this.tontine!.currentTurn
          || (m.turnNumber === this.tontine!.currentTurn && currentTurnIsReceived);

        return {
          number: m.turnNumber!,
          memberId: m.userId,
          memberName: m.userName ?? 'Membre',
          dateLabel: estimatedDate
            ? estimatedDate.toLocaleDateString('fr-FR', {
              weekday: 'long', day: 'numeric',
              month: 'long', year: 'numeric',
            })
            : '—',
          estimatedDate,
          isMe: m.userId === this.uid,
          isCurrent,
          isDone,
        };
      });
  }

  computeTurnDate(
    referenceDate: Date | null,
    turnNumber: number,
    frequency: string
  ): Date | null {
    if (!referenceDate) return null;
    const d = new Date(referenceDate);
    const offset = turnNumber - 1;
    switch (frequency) {
      case 'daily': d.setDate(d.getDate() + offset); break;
      case 'weekly': d.setDate(d.getDate() + offset * 7); break;
      case 'biweekly': d.setDate(d.getDate() + offset * 14); break;
      case 'monthly':
      default: d.setMonth(d.getMonth() + offset); break;
    }
    return d;
  }

  // ════════════════════════════════════════════════════════
  // STATS
  // ════════════════════════════════════════════════════════

  private buildStats(): void {
    if (!this.tontine) return;

    const currentTurnMember = this.allMembers.find(
      m => m.turnNumber === this.tontine!.currentTurn
    );

    this.stats = {
      totalCollected: this.tontine.stats?.totalCollected ?? 0,
      currentBeneficiary: currentTurnMember?.userName ?? '—',
      nextDate: this.tontine.nextPaymentDate,
      paidCount: 0,
      unpaidCount: 0,
      punctualityRate: Math.round(this.tontine.stats?.onTimePaymentRate ?? 100),
      completedTurns: this.tontine.currentTurn,
      nextDueLabel: this.computeNextDueLabel(),
    };
  }

  // ════════════════════════════════════════════════════════
  // ACTIONS
  // ════════════════════════════════════════════════════════

  async payNow(): Promise<void> {
    this.router.navigate(['/tontines', this.tontineId, 'pay']);
  }

  async openReceipt(): Promise<void> {
    if (!this.myContribution || this.myContribution.status !== 'paid') return;
    if (!this.currentTurnPayment) return;

    const payment = {
      totalAmount: this.currentTurnPayment.totalAmount ?? this.tontine?.amount,
      paymentMethod: this.currentTurnPayment.paymentMethod ?? '—',
      confirmedAt: this.currentTurnPayment.confirmedAt,
      transactionId: this.currentTurnPayment.transactionId,
      // FIX : lire le turnNumber depuis le paiement, pas depuis tontine.currentTurn
      turnNumber: this.currentTurnPayment.turnNumber,
      paidAt: this.toDate(this.currentTurnPayment.paidAt),
      status: 'confirmé',
      metadata: { tontineName: this.tontine?.name },
    };

    const modal = await this.modalCtrl.create({
      component: ReceiptModalComponent,
      componentProps: { payment },
      breakpoints: [0, 0.5, 0.8],
      initialBreakpoint: 0.5,
      backdropDismiss: true,
      cssClass: 'panel-modal',
    });
    await modal.present();
  }

  goToDistribution(): void {
    this.router.navigate(['/tontines', this.tontineId, 'distribute']);
  }

  goToConfirmReception(): void {
    this.router.navigate([
      '/tontines', this.tontineId, 'distribute',
      (this.tontine as any)?.currentDistributionId,
    ]);
  }

  // ════════════════════════════════════════════════════════
  // HELPERS ONGLET TOUR
  // ════════════════════════════════════════════════════════

  myTurnIconName(): string {
    const ct = this.tontine?.currentTurn ?? 0;
    const mt = this.tontine?.myTurnNumber ?? null;
    if (mt == null) return 'hourglass-outline';
    if (ct === mt) return 'gift-outline';
    if (ct > mt) return 'checkmark-done-outline';
    return 'hand-left-outline';
  }

  myTurnHeadline(): string {
    const ct = this.tontine?.currentTurn ?? 0;
    const mt = this.tontine?.myTurnNumber ?? null;
    if (mt == null) return 'Tour non attribué';
    if (ct === mt) return "C'est votre tour !";
    if (ct > mt) return 'Votre tour est passé';
    return `Vous recevrez votre pot au tour ${mt}`;
  }

  myTurnDateLabel(): string {
    const turnDate = this.getMyTurnDate();
    if (!turnDate) return '—';
    return turnDate.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  myTurnCountdown(): string {
    const ct = this.tontine?.currentTurn ?? 0;
    const mt = this.tontine?.myTurnNumber ?? null;
    if (mt == null) return '—';
    if (ct > mt) return 'Passé';
    if (ct === mt) return "Aujourd'hui";

    const turnDate = this.getMyTurnDate();
    if (!turnDate) return '—';
    const diffMs = turnDate.getTime() - Date.now();
    if (diffMs <= 0) return 'Passé';
    const diffDays = Math.ceil(diffMs / 86400000);
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays < 7) return `Dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    if (diffDays < 30) {
      const w = Math.floor(diffDays / 7);
      return `Dans ${w} semaine${w > 1 ? 's' : ''}`;
    }
    const months = Math.round(diffDays / 30);
    return `Dans ${months} mois`;
  }

  private getMyTurnDate(): Date | null {
    if (!this.tontine?.myTurnNumber) return null;
    const ref = this.toDate(this.tontine.startedAt ?? this.tontine.nextPaymentDate);
    return this.computeTurnDate(ref, this.tontine.myTurnNumber, this.tontine.frequency);
  }

  // ════════════════════════════════════════════════════════
  // HELPERS PARAMÈTRES
  // ════════════════════════════════════════════════════════

  private getEstimatedDurationDays(): number | null {
    if (!this.tontine) return null;
    const freqDays = this.frequencyInDays(this.tontine.frequency);
    return freqDays ? this.tontine.totalTurns * freqDays : null;
  }

  private frequencyInDays(frequency: string): number {
    const map: Record<string, number> = {
      daily: 1, weekly: 7, biweekly: 14, monthly: 30,
    };
    return map[frequency] ?? 0;
  }

  cycleDurationLabel(): string {
    const days = this.getEstimatedDurationDays();
    if (!days) return '—';
    if (days < 7) return `${days} jour${days > 1 ? 's' : ''}`;
    if (days < 30) { const w = Math.ceil(days / 7); return `${w} semaine${w > 1 ? 's' : ''}`; }
    if (days < 365) { const m = Math.ceil(days / 30); return `${m} mois`; }
    const y = Math.ceil(days / 365);
    return `${y} an${y > 1 ? 's' : ''}`;
  }

  frequencyLabel(): string {
    return this.tontineService.frequencyLabel(this.tontine?.frequency as any ?? 'monthly');
  }

  securityLabel(): string {
    return this.tontineService.securityLabel(this.tontine?.securityModel as any ?? 'escrow');
  }

  earlyExitLabel(): string {
    const mode = this.tontine?.rules?.earlyExit?.mode;
    return mode ? this.tontineService.earlyExitLabel(mode) : '—';
  }

  penaltyLabel(): string {
    if (!this.tontine?.rules) return '—';
    const { penaltyType, penaltyValue } = this.tontine.rules;
    if (penaltyType === 'percentage') return `${penaltyValue}% par jour de retard`;
    if (penaltyType === 'fixed') return `${this.formatAmount(penaltyValue)} FCFA par retard`;
    return '—';
  }

  exclusionLabel(): string {
    const days = this.tontine?.rules?.autoExclusionDays;
    return days == null ? 'Jamais (vote requis)' : `${days} jours de retard`;
  }

  modificationLabel(): string {
    return `${this.tontine?.rules?.modificationThreshold ?? 75}% d'approbation`;
  }

  // ════════════════════════════════════════════════════════
  // HELPERS INTERNES
  // ════════════════════════════════════════════════════════

  private computeNextDueLabel(): string {
    if (!this.tontine) return '—';
    const d = this.toDate(this.tontine.nextPaymentDate);
    if (!d) return '—';
    const diffMs = d.getTime() - Date.now();
    if (diffMs <= 0) return 'Expiré';
    const hours = Math.floor(diffMs / 3600000);
    return hours < 24 ? `Dans ${hours}h` : `Dans ${Math.floor(hours / 24)}j`;
  }

  private computeTimeLeft(value: any): string {
    const d = this.toDate(value);
    if (!d) return '—';
    const diffMs = d.getTime() - Date.now();
    if (diffMs <= 0) return 'Expiré';
    const hours = Math.floor(diffMs / 3600000);
    if (hours < 24) return `${hours} heure${hours > 1 ? 's' : ''}`;
    const days = Math.floor(hours / 24);
    return `${days} jour${days > 1 ? 's' : ''}`;
  }

  private computeDaysLate(): number {
    const d = this.toDate(this.tontine?.nextPaymentDate);
    if (!d) return 0;
    const diffMs = Date.now() - d.getTime();
    return diffMs <= 0 ? 0 : Math.floor(diffMs / 86400000);
  }

  setTab(tab: TabKey): void {
    this.donutDrawn = false;
    this.activeTab = tab;
  }

  toggleHistoryEntry(entry: HistoryEntry): void {
    entry.expanded = !entry.expanded;
  }

  // ── Donut ──────────────────────────────────────────────

  private drawDonut(): void {
    const canvas = document.getElementById('donutCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    this.donutDrawn = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const total = this.tontine?.totalTurns ?? 1;
    const done = this.stats.completedTurns;
    const ratio = total > 0 ? Math.min(done / total, 1) : 0;
    const cx = 65, cy = 65, r = 50, lw = 16;

    ctx.clearRect(0, 0, 130, 130);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = lw;
    ctx.stroke();

    if (ratio > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.strokeStyle = '#1D4ED8';
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  // ── Utilitaires publics ────────────────────────────────

  toDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value._seconds !== undefined) return new Date(value._seconds * 1000);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  formatDate(value: any): string {
    const d = this.toDate(value);
    if (!d) return '—';
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  formatDateTime(value: any): string {
    const d = this.toDate(value);
    if (!d) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' à '
      + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  formatAmount(v: number): string {
    return new Intl.NumberFormat('fr-FR').format(v ?? 0);
  }
}