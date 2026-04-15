import { Component, OnInit, OnDestroy, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import {
  IonContent, IonIcon, IonSkeletonText, ToastController, ModalController
} from '@ionic/angular/standalone';

import { HistoryEntry, MyContribution, PageStats, Tontine, TontineMember, TurnItem } from 'src/app/core/models/tontine.model';
import { TontineService } from 'src/app/core/services/tontine.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { PaymentService } from 'src/app/core/services/payment.service';
import { ReceiptModalComponent } from 'src/app/shared/modals/receipt-modal/receipt-modal.component';

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
  myPayments: any[] = [];
  activeTab: TabKey = 'flux';
  private donutDrawn = false;

  tabs: { key: TabKey; label: string }[] = [
    { key: 'flux', label: 'Flux' },
    { key: 'tour', label: 'Tour' },
    { key: 'historiques', label: 'Historiques' },
    { key: 'parametres', label: 'Paramètres' },
  ];

  // ── Données chargées ──────────────────────────────────
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
    private toastCtrl: ToastController,
    private modalCtrl: ModalController
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
            // On charge les membres puis on construit tout le reste
            this.loadMembersAndBuild();
          } else {
            this.status = 'error';
          }
        },
        error: () => { this.status = 'error'; },
      });
  }

  /**
   * Charge la liste des membres actifs puis :
   * - construit la timeline (Flux)
   * - détermine le bénéficiaire actuel (Historiques)
   * - construit l'état de cotisation du membre connecté (Tour)
   * - alimente les stats globales
   */
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
          this.buildMyContribution();
          this.loadMyPayments();
        },
      });
  }

  // ════════════════════════════════════════════════════════
  // CONSTRUCTION DE LA TIMELINE (FLUX)
  // ════════════════════════════════════════════════════════

  private buildTimeline(): void {
    if (!this.tontine) return;

    const referenceDate = this.toDate(this.tontine.startedAt ?? this.tontine.nextPaymentDate);

    this.turns = this.allMembers
      .filter(m => m.turnNumber != null)
      .sort((a, b) => (a.turnNumber ?? 0) - (b.turnNumber ?? 0))
      .map(m => {
        const estimatedDate = this.computeTurnDate(
          referenceDate,
          m.turnNumber!,
          this.tontine!.frequency
        );
        return {
          number: m.turnNumber!,
          memberId: m.userId,
          memberName: m.userName ?? 'Membre',
          dateLabel: estimatedDate
            ? estimatedDate.toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
            : '—',
          estimatedDate,
          isMe: m.userId === this.uid,
          isCurrent: m.turnNumber === this.tontine!.currentTurn,
          isDone: (m.turnNumber ?? 0) < this.tontine!.currentTurn,
        };
      });
  }

  /**
   * Calcule la date estimée d'un tour donné.
   *
   * Logique identique à getNextPaymentDate() du backend :
   *   tour 1 = date de démarrage
   *   tour N = date démarrage + (N-1) × fréquence
   */
  computeTurnDate(referenceDate: Date | null, turnNumber: number, frequency: string): Date | null {
    if (!referenceDate) return null;

    const d = new Date(referenceDate);
    const offset = turnNumber - 1; // tour 1 = la date de départ elle-même

    switch (frequency) {
      case 'daily': d.setDate(d.getDate() + offset); break;
      case 'weekly': d.setDate(d.getDate() + offset * 7); break;
      case 'biweekly': d.setDate(d.getDate() + offset * 14); break;
      case 'monthly':
      default:
        // Même logique que le backend : ajouter N mois entiers
        d.setMonth(d.getMonth() + offset);
        break;
    }
    return d;
  }

  // ════════════════════════════════════════════════════════
  // STATS (HISTORIQUES)
  // ════════════════════════════════════════════════════════

  private buildStats(): void {
    if (!this.tontine) return;

    // Bénéficiaire du tour actuel = membre dont turnNumber === currentTurn
    const currentTurnMember = this.allMembers.find(
      m => m.turnNumber === this.tontine!.currentTurn
    );

    // Comptage payé / non payé (approximation depuis myStats disponibles)
    // Les stats globales (paid/unpaid par tour) nécessitent un endpoint dédié.
    // On utilise ce qu'on a : tontine.stats + myStats du membre connecté.
    const myMemberData = this.allMembers.find(m => m.userId === this.uid);

    this.stats = {
      totalCollected: this.tontine.stats?.totalCollected ?? 0,
      currentBeneficiary: currentTurnMember?.userName ?? '—',
      nextDate: this.tontine.nextPaymentDate,
      paidCount: 0,    // endpoint dédié requis
      unpaidCount: 0,
      punctualityRate: Math.round(this.tontine.stats?.onTimePaymentRate ?? 100),
      completedTurns: this.tontine.currentTurn,
      nextDueLabel: this.computeNextDueLabel(),
    };
  }

  // ════════════════════════════════════════════════════════
  // COTISATION DU MEMBRE CONNECTÉ (TOUR)
  // ════════════════════════════════════════════════════════

  private buildMyContribution(): void {
    if (!this.tontine?.myStats) {
      // Tontine pending ou pas encore de données
      this.myContribution = null;
      return;
    }

    const { latePayments, missedPayments, onTimePayments } = this.tontine.myStats;
    const totalPayments = onTimePayments + latePayments + missedPayments;

    // Si des paiements en retard existent et que le total collecté par ce membre
    // est inférieur à ce qu'il devrait avoir payé → retard en cours
    const expectedPaid = this.tontine.amount * this.tontine.currentTurn;
    const actualPaid = this.tontine.myStats.totalPaid;
    const isCurrentlyLate = actualPaid < expectedPaid && this.tontine.currentTurn > 0;

    if (isCurrentlyLate) {
      const daysLate = this.computeDaysLate();
      const penaltyRate = this.tontine.rules?.penaltyValue ?? 5;
      const penaltyType = this.tontine.rules?.penaltyType ?? 'percentage';
      const missing = expectedPaid - actualPaid;

      let penalty = 0;
      if (penaltyType === 'percentage') {
        penalty = Math.round(missing * (penaltyRate / 100) * daysLate);
      } else {
        // fixed : pénalité forfaitaire par retard
        penalty = penaltyRate * daysLate;
      }

      this.myContribution = {
        status: 'late',
        dueDate: this.tontine.nextPaymentDate,
        penalty,
        totalDue: missing + penalty,
        daysLate,
      };
    } else if (actualPaid >= expectedPaid && this.tontine.currentTurn > 0) {
      // Tour en cours déjà payé
      this.myContribution = {
        status: 'paid',
        paidAt: this.tontine.nextPaymentDate, // approximation — endpoint paiements requis
        receiptRef: null as any,
        paymentId: null as any,
      };
    } else {
      // À payer
      this.myContribution = {
        status: 'due',
        dueDate: this.tontine.nextPaymentDate,
        timeLeft: this.computeTimeLeft(this.tontine.nextPaymentDate),
      };
    }
  }

  loadMyPayments(): void {
    if (!this.tontineId) return;

    this.paymentService.getMyPayments(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        if (res.success) {
          this.myPayments = res.data;

          // prendre le dernier paiement
          const lastPayment = this.myPayments[this.myPayments.length - 1];

          if (lastPayment) {
            this.myContribution = {
              status: 'paid',
              paidAt: lastPayment.createdAt,
              receiptRef: lastPayment.paymentId,
              receiptUrl: lastPayment.receiptUrl, 
            };
          }
        }
      });
  }

  async openReceipt() {
    if (!this.myContribution || this.myContribution.status !== 'paid') return;

    const payment = {
      totalAmount: this.tontine?.amount,
      paymentMethod: this.myPayments[this.myPayments.length - 1]?.paymentMethod ?? '—',
      confirmedAt: this.myContribution.paidAt,
      transactionId: this.myPayments[this.myPayments.length - 1]?.transactionId,
      turnNumber: this.tontine?.currentTurn,
      paidAt: this.toDate(this.myPayments[this.myPayments.length - 1]?.paidAt),
      status: 'confirmé',
      metadata: {
        tontineName: this.tontine?.name
      }
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

  // ════════════════════════════════════════════════════════
  // HELPERS — ONGLET TOUR
  // ════════════════════════════════════════════════════════

  /** Icône dans le hero de l'onglet Tour */
  myTurnIconName(): string {
    const ct = this.tontine?.currentTurn ?? 0;
    const mt = this.tontine?.myTurnNumber ?? null;
    if (mt == null) return 'hourglass-outline';
    if (ct === mt) return 'gift-outline';
    if (ct > mt) return 'checkmark-done-outline';
    return 'hand-left-outline';
  }

  /**
   * Texte principal de l'onglet Tour :
   * - "C'est votre tour !"         → currentTurn === myTurnNumber
   * - "Votre tour est passé"       → currentTurn > myTurnNumber
   * - "Vous recevrez votre pot au tour N" → pas encore arrivé
   * - "Tour non attribué"         → pas de turnNumber (rotation aléatoire en attente)
   */
  myTurnHeadline(): string {
    const ct = this.tontine?.currentTurn ?? 0;
    const mt = this.tontine?.myTurnNumber ?? null;
    if (mt == null) return 'Tour non attribué';
    if (ct === mt) return "C'est votre tour !";
    if (ct > mt) return 'Votre tour est passé';
    return `Vous recevrez votre pot au tour ${mt}`;
  }

  /**
   * Date estimée où le membre connecté recevra son pot.
   * Utilise computeTurnDate() avec startedAt comme référence.
   */
  myTurnDateLabel(): string {
    const turnDate = this.getMyTurnDate();
    if (!turnDate) return '—';
    return turnDate.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  /**
   * Compte à rebours jusqu'au tour du membre connecté.
   * Exemples : "Dans 2 mois", "Dans 5 jours", "Aujourd'hui", "Passé"
   */
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

    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays < 7) return `Dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    if (diffDays < 30) return `Dans ${Math.floor(diffDays / 7)} semaine${Math.floor(diffDays / 7) > 1 ? 's' : ''}`;
    const months = Math.round(diffDays / 30);
    return `Dans ${months} mois`;
  }

  /** Date estimée du tour du membre connecté (objet Date brut) */
  private getMyTurnDate(): Date | null {
    if (!this.tontine?.myTurnNumber) return null;
    const ref = this.toDate(this.tontine.startedAt ?? this.tontine.nextPaymentDate);
    return this.computeTurnDate(ref, this.tontine.myTurnNumber, this.tontine.frequency);
  }

  // ════════════════════════════════════════════════════════
  // HELPERS — DURÉE DU CYCLE (identique à join-preview)
  // ════════════════════════════════════════════════════════

  /**
   * Calcule la durée estimée du cycle en jours
   * en utilisant la même logique que le backend :
   *   estimatedDuration = totalTurns * frequencyInDays
   */
  private getEstimatedDurationDays(): number | null {
    if (!this.tontine) return null;
    const freqDays = this.frequencyInDays(this.tontine.frequency);
    if (!freqDays) return null;
    return this.tontine.totalTurns * freqDays;
  }

  private frequencyInDays(frequency: string): number {
    switch (frequency) {
      case 'daily': return 1;
      case 'weekly': return 7;
      case 'biweekly': return 14;
      case 'monthly': return 30;
      default: return 0;
    }
  }

  /**
   * Label lisible de la durée du cycle — identique à formatDuration() de join-preview.
   * Exemples : "10 mois", "2 semaines", "1 an"
   */
  cycleDurationLabel(): string {
    const days = this.getEstimatedDurationDays();
    if (!days) return '—';

    if (days < 7) {
      return `${days} jour${days > 1 ? 's' : ''}`;
    }
    if (days < 30) {
      const weeks = Math.ceil(days / 7);
      return `${weeks} semaine${weeks > 1 ? 's' : ''}`;
    }
    if (days < 365) {
      const months = Math.ceil(days / 30);
      return `${months} mois`;
    }
    const years = Math.ceil(days / 365);
    return `${years} an${years > 1 ? 's' : ''}`;
  }

  // ════════════════════════════════════════════════════════
  // HELPERS — PARAMÈTRES
  // ════════════════════════════════════════════════════════

  frequencyLabel(): string {
    return this.tontineService.frequencyLabel(this.tontine?.frequency as any ?? 'monthly');
  }

  securityLabel(): string {
    return this.tontineService.securityLabel(this.tontine?.securityModel as any ?? 'escrow');
  }

  earlyExitLabel(): string {
    const mode = this.tontine?.rules?.earlyExit?.mode;
    if (!mode) return '—';
    return this.tontineService.earlyExitLabel(mode);
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
    if (days == null) return 'Jamais (vote requis)';
    return `${days} jours de retard`;
  }

  modificationLabel(): string {
    const t = this.tontine?.rules?.modificationThreshold ?? 75;
    return `${t}% d'approbation`;
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
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 24) return `Dans ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Dans ${days}j`;
  }

  private computeTimeLeft(value: any): string {
    const d = this.toDate(value);
    if (!d) return '—';
    const diffMs = d.getTime() - Date.now();
    if (diffMs <= 0) return 'Expiré';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 24) return `${hours} heure${hours > 1 ? 's' : ''}`;
    const days = Math.floor(hours / 24);
    return `${days} jour${days > 1 ? 's' : ''}`;
  }

  private computeDaysLate(): number {
    const d = this.toDate(this.tontine?.nextPaymentDate);
    if (!d) return 0;
    const diffMs = Date.now() - d.getTime();
    if (diffMs <= 0) return 0;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  // ── Actions ──────────────────────────────────────────────

  async payNow(): Promise<void> {
    const t = await this.toastCtrl.create({
      message: 'Paiement en cours…',
      duration: 2000,
      position: 'bottom',
    });
    await t.present();
    this.router.navigate(['/tontines', this.tontineId, 'pay']);
  }

  setTab(tab: TabKey): void {
    this.donutDrawn = false;
    this.activeTab = tab;
  }

  toggleHistoryEntry(entry: HistoryEntry): void {
    entry.expanded = !entry.expanded;
  }

  // ── Donut ─────────────────────────────────────────────────

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

    // Piste fond
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = lw;
    ctx.stroke();

    // Arc progression
    if (ratio > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.strokeStyle = '#1D4ED8';
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  // ── Utilitaires publics (utilisés dans le template) ───────

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