import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import {
  IonContent, IonIcon, IonSkeletonText,
  IonInput, ToastController, AlertController
} from '@ionic/angular/standalone';

import { TontineService } from 'src/app/core/services/tontine.service';
import { PaymentService } from 'src/app/core/services/payment.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import {
  Payment,
  PaymentMethod,
  PaymentMethodConfig,
  PAYMENT_METHODS,
  InitiatePaymentPayload,
} from 'src/app/core/models/payment.model';
import { Tontine } from 'src/app/core/models/tontine.model';

type PageStep =
  | 'loading'
  | 'select_method'
  | 'enter_number'
  | 'confirm'
  | 'processing'
  | 'success'
  | 'failed'
  | 'error';

@Component({
  selector: 'app-tontine-payment',
  templateUrl: './tontine-payment.page.html',
  styleUrls: ['./tontine-payment.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent, IonIcon, IonSkeletonText, IonInput,
    PageHeaderComponent,
    CustomButtonComponent,
  ],
})
export class TontinePaymentPage implements OnInit, OnDestroy {

  // ── Routing ───────────────────────────────────────────────────────────────
  tontineId: string | null = null;
  paymentId: string | null = null;

  // ── Données ───────────────────────────────────────────────────────────────
  tontine: Tontine | null = null;
  existingPayment: Payment | null = null;
  uid: string | null = null;

  // ── UI state ──────────────────────────────────────────────────────────────
  step: PageStep = 'loading';
  methods: PaymentMethodConfig[] = PAYMENT_METHODS;
  selectedMethod: PaymentMethodConfig | null = null;
  phoneNumber = '';
  fullName = '';
  isSubmitting = false;

  // ── Résultat ──────────────────────────────────────────────────────────────
  confirmedPayment: {
    paymentId: string;
    totalAmount: number;
    receiptUrl?: string;
    transactionId?: string;
    confirmedAt?: string;
  } | null = null;

  // ── Montants calculés ─────────────────────────────────────────────────────
  get baseAmount(): number { return this.tontine?.amount ?? 0; }
  get penaltyAmount(): number { return this._penaltyAmount; }
  get totalAmount(): number { return this.baseAmount + this._penaltyAmount; }
  get daysLate(): number { return this._daysLate; }
  get isLate(): boolean { return this._daysLate > (this.tontine?.rules?.gracePeriodDays ?? 0); }

  /** Nom complet de l'utilisateur connecté (affiché dans le reçu) */
  get currentUserName(): string | null {
    return this.authService.currentUser?.fullName ?? null;
  }

  private _penaltyAmount = 0;
  private _daysLate = 0;
  private _processingTimeout?: any;
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tontineService: TontineService,
    private paymentService: PaymentService,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
  ) { }

  ngOnInit(): void {
    this.uid = this.authService.currentUser?.uid ?? null;
    this.phoneNumber = this.authService.currentUser?.phoneNumber ?? '';
    this.fullName = this.authService.currentUser?.fullName ?? '';

    this.tontineId = this.route.snapshot.paramMap.get('tontineId');
    this.paymentId = this.route.snapshot.paramMap.get('paymentId');

    if (!this.tontineId) { this.step = 'error'; return; }

    if (this.paymentId) {
      this.loadReceipt();
    } else {
      this.loadTontine();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this._processingTimeout) clearTimeout(this._processingTimeout);
  }

  // ════════════════════════════════════════════════════════
  // CHARGEMENT
  // ════════════════════════════════════════════════════════

  loadTontine(): void {
    this.step = 'loading';

    this.tontineService.getTontineById(this.tontineId!)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { if (this.step === 'loading') this.step = 'error'; })
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.tontine = res.data;
            this._computePenalty();
            this.step = 'select_method';
          } else {
            this.step = 'error';
          }
        },
        error: () => { this.step = 'error'; },
      });
  }

  private loadReceipt(): void {
    this.step = 'loading';

    this.paymentService.getReceipt(this.paymentId!)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { if (this.step === 'loading') this.step = 'error'; })
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.existingPayment = res.data.payment;
            this.confirmedPayment = {
              paymentId: res.data.payment.id,
              totalAmount: res.data.payment.totalAmount,
              receiptUrl: res.data.payment.receiptUrl,
              transactionId: res.data.payment.transactionId,
            };
            this.step = 'success';
          } else {
            this.step = 'error';
          }
        },
        error: () => { this.step = 'error'; },
      });
  }

  // ════════════════════════════════════════════════════════
  // CALCUL DE LA PÉNALITÉ
  // ════════════════════════════════════════════════════════

  private _computePenalty(): void {
    if (!this.tontine) return;

    const nextPaymentDate = this.tontine.nextPaymentDate;
    if (!nextPaymentDate) return;

    const dueDate = this._toDate(nextPaymentDate);
    if (!dueDate) return;

    const diffMs = Date.now() - dueDate.getTime();
    if (diffMs <= 0) { this._daysLate = 0; this._penaltyAmount = 0; return; }

    this._daysLate = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const gracePeriod = this.tontine.rules?.gracePeriodDays ?? 0;
    const effectiveDays = Math.max(0, this._daysLate - gracePeriod);

    if (effectiveDays <= 0) { this._penaltyAmount = 0; return; }

    const { penaltyType, penaltyValue } = this.tontine.rules ?? {};

    if (penaltyType === 'percentage') {
      this._penaltyAmount = Math.round(this.baseAmount * ((penaltyValue ?? 0) / 100) * effectiveDays);
    } else if (penaltyType === 'fixed') {
      this._penaltyAmount = (penaltyValue ?? 0) * effectiveDays;
    }
  }

  // ════════════════════════════════════════════════════════
  // NAVIGATION
  // ════════════════════════════════════════════════════════

  selectMethod(method: PaymentMethodConfig): void {
    this.selectedMethod = method;
    if (!this.phoneNumber) {
      this.phoneNumber = this.authService.currentUser?.phoneNumber ?? '';
    }
    this.step = 'enter_number';
  }

  /**
   * Déclenché par le bouton "Payer maintenant" (step select_method).
   * Si une seule méthode, la sélectionne directement.
   * Sinon, met en évidence la liste (scroll ou toast).
   */
  openDefaultMethod(): void {
    if (this.methods.length === 1) {
      this.selectMethod(this.methods[0]);
    } else {
      this.showToast('Veuillez choisir une méthode de paiement ci-dessus', 'medium');
    }
  }

  goBack(): void {
    switch (this.step) {
      case 'enter_number': this.step = 'select_method'; break;
      case 'confirm': this.step = 'enter_number'; break;
      default: this.router.navigate(['../']);
    }
  }

  proceedToConfirm(): void {
    if (!this.phoneNumber.trim()) {
      this.showToast('Veuillez saisir votre numéro');
      return;
    }

    const minLen = this.selectedMethod?.id === 'manual' ? 4 : 8;
    if (this.phoneNumber.trim().replace(/\s/g, '').length < minLen) {
      this.showToast(`Numéro trop court (minimum ${minLen} chiffres)`);
      return;
    }

    this.step = 'confirm';
  }

  // ════════════════════════════════════════════════════════
  // PAIEMENT
  // ════════════════════════════════════════════════════════

  async pay(): Promise<void> {
    if (!this.tontineId || !this.selectedMethod || this.isSubmitting) return;

    const confirmed = await this.showConfirmAlert();
    if (!confirmed) return;

    this.isSubmitting = true;
    this.step = 'processing';

    const payload: InitiatePaymentPayload = {
      tontineId: this.tontineId,
      paymentMethod: this.selectedMethod.id,
      paymentMethodNumber: this.phoneNumber.trim(),
      turnNumber: this.tontine?.currentTurn,
    };

    this.paymentService.initiate(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (initRes) => {
          if (!initRes.success) {
            this.isSubmitting = false;
            this.step = 'failed';
            return;
          }

          const { paymentId, simulationDelayMs } = initRes.data;

          this._processingTimeout = setTimeout(() => {
            this.paymentService.verify({ paymentId })
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: (verifyRes) => {
                  this.isSubmitting = false;
                  if (verifyRes.success && verifyRes.data.status === 'confirmed') {
                    this.confirmedPayment = {
                      paymentId: verifyRes.data.paymentId,
                      totalAmount: initRes.data.totalAmount,
                      receiptUrl: verifyRes.data.receiptUrl,
                      transactionId: verifyRes.data.transactionId,
                      confirmedAt: verifyRes.data.confirmedAt,
                    };
                    this.step = 'success';
                  } else if (
                    verifyRes.data?.status === 'pending' &&
                    this.selectedMethod?.id === 'manual'
                  ) {
                    this.confirmedPayment = {
                      paymentId: verifyRes.data.paymentId,
                      totalAmount: initRes.data.totalAmount,
                    };
                    this.step = 'success';
                  } else {
                    this.step = 'failed';
                  }
                },
                error: () => {
                  this.isSubmitting = false;
                  this.step = 'failed';
                },
              });
          }, simulationDelayMs ?? 3000);
        },
        error: (err) => {
          this.isSubmitting = false;
          this.step = 'failed';
          this.showToast(err?.error?.error ?? 'Erreur lors du paiement');
        },
      });
  }

  retryPayment(): void {
    this.step = 'confirm';
    this.isSubmitting = false;
  }

  goToTontine(): void {
    this.router.navigate(['/tontines', this.tontineId]);
  }

  /** Télécharge le reçu PDF si l'URL est disponible */
  downloadReceipt(): void {
    if (this.confirmedPayment?.receiptUrl) {
      window.open(this.confirmedPayment.receiptUrl, '_blank');
    }
  }

  // ════════════════════════════════════════════════════════
  // HELPERS UI
  // ════════════════════════════════════════════════════════

  get pageTitle(): string {
    switch (this.step) {
      case 'select_method': return 'Versement';
      case 'enter_number': return this.selectedMethod?.label ?? 'Numéro';
      case 'confirm': return 'Récapitulatif';
      case 'processing': return 'Paiement en cours';
      case 'success': return 'Versement';
      case 'failed': return 'Paiement échoué';
      default: return 'Paiement';
    }
  }

  get processingMessage(): string {
    if (!this.selectedMethod) return 'Traitement en cours…';
    return ({
      wave: 'En attente de confirmation Wave…',
      orange: 'En attente de confirmation Orange Money…',
      free: 'En attente de confirmation Free Money…',
      mtn: 'En attente de confirmation MTN MoMo…',
      moov: 'En attente de confirmation Moov Money…',
      manual: 'Enregistrement du paiement…',
    } as Record<string, string>)[this.selectedMethod.id] ?? 'Traitement en cours…';
  }

  get isManual(): boolean {
    return this.selectedMethod?.id === 'manual';
  }

  get currentTurnLabel(): string {
    return `Tour ${this.tontine?.currentTurn ?? '—'}`;
  }

  formatAmount(v: number): string {
    return this.paymentService.formatAmount(v);
  }

  formatDate(value: any): string {
    const d = this._toDate(value);
    if (!d) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatDateTime(value: any): string {
    const d = this._toDate(value);
    if (!d) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' à '
      + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ════════════════════════════════════════════════════════
  // UTILITAIRES INTERNES
  // ════════════════════════════════════════════════════════

  private _toDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (value._seconds !== undefined) return new Date(value._seconds * 1000);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  private async showConfirmAlert(): Promise<boolean> {
    return new Promise(async (resolve) => {
      const alert = await this.alertCtrl.create({
        header: 'Confirmer le paiement',
        message: `Payer ${this.formatAmount(this.totalAmount)} FCFA via ${this.selectedMethod?.label} ?`,
        buttons: [
          { text: 'Annuler', role: 'cancel', handler: () => resolve(false) },
          { text: 'Confirmer', handler: () => resolve(true) },
        ],
      });
      await alert.present();
    });
  }

  private async showToast(message: string, color: string = 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}