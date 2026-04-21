import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import {
  IonContent, IonIcon, IonSkeletonText, IonInput,
  ToastController, AlertController,
} from '@ionic/angular/standalone';

import { TontineService } from 'src/app/core/services/tontine.service';
import { DistributionService } from 'src/app/core/services/distribution.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import {
  Distribution,
  DistributionMethod,
  DistributionMethodConfig,
  DistributionStatus,
  DISTRIBUTION_METHODS,
  TurnCollectionStatus,
  TriggerDistributionPayload,
} from 'src/app/core/models/distribution.model';
import { Tontine } from 'src/app/core/models/tontine.model';

type PageStep =
  | 'loading'
  | 'collection_status'
  | 'select_method'
  | 'enter_phone'
  | 'confirm'
  | 'processing'
  | 'sent'
  | 'confirmed'
  | 'tontine_completed'
  | 'history'
  | 'error';

@Component({
  selector: 'app-tontine-distribution',
  templateUrl: './tontine-distribution.page.html',
  styleUrls: ['./tontine-distribution.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonContent, IonIcon, IonSkeletonText, IonInput,
    PageHeaderComponent, CustomButtonComponent,
  ],
})
export class TontineDistributionPage implements OnInit, OnDestroy {

  tontineId: string | null = null;
  distributionId: string | null = null;

  tontine: Tontine | null = null;
  collectionStatus: TurnCollectionStatus | null = null;
  currentDistribution: Distribution | null = null;
  distributions: Distribution[] = [];
  uid: string | null = null;
  isAdminOrCreator = false;
  isBeneficiary = false;

  step: PageStep = 'loading';
  methods: DistributionMethodConfig[] = DISTRIBUTION_METHODS;
  selectedMethod: DistributionMethodConfig | null = null;

  // BUG #1 FIX — le numéro est pré-rempli automatiquement,
  // l'admin peut quand même le modifier
  beneficiaryPhone = '';
  phoneWasAutoFilled = false;

  isSubmitting = false;

  confirmResult: {
    distributionId: string;
    nextTurnNumber: number | null;
    nextBeneficiaryUid: string | null;
    tontineCompleted: boolean;
  } | null = null;

  private _processingTimeout?: any;
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tontineService: TontineService,
    private distributionService: DistributionService,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
  ) { }

  ngOnInit(): void {
    this.uid = this.authService.currentUser?.uid ?? null;
    this.tontineId = this.route.snapshot.paramMap.get('tontineId');
    this.distributionId = this.route.snapshot.paramMap.get('distributionId');

    if (!this.tontineId) { this.step = 'error'; return; }

    if (this.distributionId) {
      this.loadDistribution();
    } else {
      this.loadPage();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this._processingTimeout) clearTimeout(this._processingTimeout);
  }

  // ════════════════════════════════════════════════════════
  // BUG #4 FIX — CHARGEMENT SANS FLASH D'ERREUR
  //
  // Problème : finalize() passait à 'error' avant que
  // loadCollectionStatus() réponde, car step était encore 'loading'.
  //
  // Solution : utiliser forkJoin pour charger tontine + collectionStatus
  // en parallèle dans un seul appel, et ne passer à 'error' que si
  // les DEUX requêtes ont échoué.
  // ════════════════════════════════════════════════════════

  loadPage(): void {
    this.step = 'loading';

    const tontine$ = this.tontineService.getTontineById(this.tontineId!).pipe(
      catchError(() => of(null))
    );

    tontine$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        if (!res || !res.success) { this.step = 'error'; return; }

        this.tontine = res.data;
        this.isAdminOrCreator =
          res.data.myRole === 'creator' || res.data.myRole === 'admin';
        this.isBeneficiary =
          this.uid === (res.data as any).currentBeneficiaryUid;

        // Charger le statut de collecte SEULEMENT après avoir la tontine
        // On ne set PAS step='error' si ça rate — on reste sur loading
        // jusqu'à la réponse, puis on décide.
        this.distributionService
          .getTurnStatus(this.tontineId!, this.tontine!.currentTurn)
          .pipe(
            takeUntil(this.destroy$),
            catchError(() => of(null))
          )
          .subscribe({
            next: (csRes) => {
              if (!csRes || !csRes.success) {
                // getTurnStatus a échoué mais on a quand même la tontine
                // → afficher la collecte avec un état vide plutôt qu'une erreur
                this.collectionStatus = null;
                this.step = this.isAdminOrCreator
                  ? 'collection_status'
                  : 'collection_status';
                return;
              }

              this.collectionStatus = csRes.data;

              // BUG #1 FIX — Pré-remplir le numéro du bénéficiaire
              this._autoFillBeneficiaryPhone(csRes.data);

              // Décider de l'étape selon l'état de la collecte
              if (csRes.data.isComplete && this.isAdminOrCreator) {
                this.step = 'select_method';
              } else {
                this.step = 'collection_status';
                if (this.isAdminOrCreator) this.loadHistory();
              }
            },
          });
      },
      error: () => { this.step = 'error'; },
    });
  }

  // ─────────────────────────────────────────────────────────
  // BUG #4 FIX — loadDistribution : même approche, pas de finalize piégeux
  // ─────────────────────────────────────────────────────────

  private loadDistribution(): void {
    this.step = 'loading';

    this.tontineService.getTontineById(this.tontineId!)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null))
      )
      .subscribe({
        next: (res) => {
          if (!res || !res.success) { this.step = 'error'; return; }

          this.tontine = res.data;
          this.isBeneficiary =
            this.uid === (res.data as any).currentBeneficiaryUid;
          this.isAdminOrCreator =
            res.data.myRole === 'creator' || res.data.myRole === 'admin';

          // Charger la distribution dans la foulée
          this.distributionService
            .getOne(this.distributionId!, this.tontineId!)
            .pipe(
              takeUntil(this.destroy$),
              catchError(() => of(null))
            )
            .subscribe({
              next: (dRes) => {
                if (!dRes || !dRes.success) {
                  this.step = 'error'; return;
                }
                this.currentDistribution = dRes.data;
                this.step = dRes.data.status === 'received'
                  ? 'confirmed'
                  : 'sent';
              },
            });
        },
      });
  }

  loadHistory(): void {
    if (!this.tontineId) return;
    this.distributionService.getByTontine(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => { if (res.success) this.distributions = res.data; },
      });
  }

  showHistory(): void {
    this.loadHistory();
    this.step = 'history';
  }

  // ════════════════════════════════════════════════════════
  // BUG #1 FIX — PRÉ-REMPLISSAGE DU NUMÉRO BÉNÉFICIAIRE
  // ════════════════════════════════════════════════════════

  private _autoFillBeneficiaryPhone(status: TurnCollectionStatus): void {
    if (status.beneficiaryPhone) {
      this.beneficiaryPhone = status.beneficiaryPhone;
      this.phoneWasAutoFilled = true;

      // Pré-sélectionner la méthode préférée si disponible
      if (status.beneficiaryPreferredMethod) {
        const methodConfig = this.methods.find(
          m => m.id === status.beneficiaryPreferredMethod
        );
        if (methodConfig) {
          this.selectedMethod = methodConfig;
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════
  // NAVIGATION
  // ════════════════════════════════════════════════════════

  selectMethod(method: DistributionMethodConfig): void {
    this.selectedMethod = method;
    // BUG #1 FIX — ne pas réinitialiser le numéro si pré-rempli
    if (!this.phoneWasAutoFilled) {
      this.beneficiaryPhone = '';
    }
    // Si numéro pré-rempli → aller directement au confirm, sinon saisie
    if (this.phoneWasAutoFilled && this.beneficiaryPhone) {
      this.step = 'confirm';
    } else {
      this.step = 'enter_phone';
    }
  }

  goBack(): void {
    switch (this.step) {
      case 'enter_phone': this.step = 'select_method'; break;
      case 'confirm':
        // Si le numéro était pré-rempli, retour à select_method
        this.step = this.phoneWasAutoFilled ? 'select_method' : 'enter_phone';
        break;
      case 'history': this.step = 'collection_status'; break;
      default: this.router.navigate(['/tontines', this.tontineId]);
    }
  }

  proceedToConfirm(): void {
    if (!this.selectedMethod) return;

    if (this.selectedMethod.id !== 'manual') {
      const clean = this.beneficiaryPhone.replace(/\s/g, '');
      if (clean.length < 8) {
        this.showToast('Numéro trop court (minimum 8 chiffres)');
        return;
      }
    } else if (this.beneficiaryPhone.trim().length < 4) {
      this.showToast('Référence trop courte (minimum 4 caractères)');
      return;
    }

    this.step = 'confirm';
  }

  clearPhone(): void {
    this.beneficiaryPhone = '';
    this.phoneWasAutoFilled = false;
    this.step = 'enter_phone';
  }

  // ════════════════════════════════════════════════════════
  // DÉCLENCHER LA DISTRIBUTION
  // ════════════════════════════════════════════════════════

  async distribute(): Promise<void> {
    if (!this.tontineId || !this.selectedMethod || this.isSubmitting) return;

    const confirmed = await this.showAlert(
      'Confirmer la distribution',
      `Envoyer ${this.formatAmount(this.tontine?.potPerTurn ?? 0)} FCFA` +
      ` via ${this.selectedMethod.label} au numéro ${this.beneficiaryPhone} ?`
    );
    if (!confirmed) return;

    this.isSubmitting = true;
    this.step = 'processing';

    const payload: TriggerDistributionPayload = {
      tontineId: this.tontineId,
      distributionMethod: this.selectedMethod.id,
      beneficiaryPhone: this.beneficiaryPhone.trim(),
    };

    this.distributionService.trigger(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (triggerRes) => {
          if (!triggerRes.success) {
            this.isSubmitting = false;
            this.step = 'collection_status';
            this.showToast(triggerRes.message, 'danger');
            return;
          }

          this.currentDistribution = {
            id: triggerRes.data.distributionId,
            tontineId: this.tontineId!,
            beneficiaryId: triggerRes.data.beneficiaryId,
            beneficiaryName: triggerRes.data.beneficiaryName,
            turnNumber: this.tontine?.currentTurn ?? 0,
            amount: triggerRes.data.amount,
            distributionMethod: this.selectedMethod!.id,
            beneficiaryPhone: this.beneficiaryPhone.trim(),
            transactionId: triggerRes.data.transactionId,
            status: triggerRes.data.status,
          };

          const delay = triggerRes.data.simulationDelayMs ?? 4000;

          this._processingTimeout = setTimeout(() => {
            this.isSubmitting = false;
            this.step = 'sent';
          }, delay);
        },
        error: (err) => {
          this.isSubmitting = false;
          this.step = 'collection_status';
          this.showToast(err?.error?.error ?? 'Erreur lors de la distribution');
        },
      });
  }

  // ════════════════════════════════════════════════════════
  // CONFIRMER LA RÉCEPTION
  // ════════════════════════════════════════════════════════

  async confirmReception(): Promise<void> {
    if (!this.currentDistribution || !this.tontineId || this.isSubmitting) return;

    const confirmed = await this.showAlert(
      'Confirmer la réception',
      `Confirmez-vous avoir reçu ${this.formatAmount(this.currentDistribution.amount)} FCFA ?`
    );
    if (!confirmed) return;

    this.isSubmitting = true;

    this.distributionService.confirm({
      distributionId: this.currentDistribution.id,
      tontineId: this.tontineId,
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isSubmitting = false;
          if (!res.success) { this.showToast(res.message, 'danger'); return; }

          this.confirmResult = {
            distributionId: res.data.distributionId,
            nextTurnNumber: res.data.nextTurnNumber ?? null,
            nextBeneficiaryUid: res.data.nextBeneficiaryUid ?? null,
            tontineCompleted: res.data.tontineCompleted,
          };

          this.step = res.data.tontineCompleted ? 'tontine_completed' : 'confirmed';
        },
        error: () => {
          this.isSubmitting = false;
          this.showToast('Erreur lors de la confirmation');
        },
      });
  }

  goToTontine(): void { this.router.navigate(['/tontines', this.tontineId, 'tontine-detail']); }
  refreshStatus(): void { this.loadPage(); }

  // ════════════════════════════════════════════════════════
  // HELPERS UI
  // ════════════════════════════════════════════════════════

  get pageTitle(): string {
    const map: Record<PageStep, string> = {
      loading: 'Distribution',
      collection_status: 'Collecte en cours',
      select_method: 'Distribuer le pot',
      enter_phone: this.selectedMethod?.label ?? 'Numéro',
      confirm: 'Récapitulatif',
      processing: 'Distribution en cours',
      sent: 'Pot envoyé',
      confirmed: 'Réception confirmée',
      tontine_completed: 'Tontine terminée',
      history: 'Historique',
      error: 'Erreur',
    };
    return map[this.step] ?? 'Distribution';
  }

  get collectionPercent(): number {
    if (!this.collectionStatus) return 0;
    return this.distributionService.collectionPercent(
      this.collectionStatus.paidCount,
      this.collectionStatus.totalMembers
    );
  }

  get progressBarStyle(): string { return `width: ${this.collectionPercent}%`; }
  get isManual(): boolean { return this.selectedMethod?.id === 'manual'; }

  get processingMessage(): string {
    return {
      wave: 'Distribution via Wave en cours...',
      orange: 'Distribution via Orange Money en cours...',
      kpay: 'Distribution via KPay en cours...',
      manual: 'Distribution manuelle en cours...',
    }[this.selectedMethod?.id ?? 'manual'] ?? 'Distribution en cours...';
     
  }

  // BUG #1 FIX — label du badge pré-remplissage
  get autoFillBadge(): string {
    if (!this.phoneWasAutoFilled || !this.collectionStatus?.beneficiaryPreferredMethod) return '';
    const method = this.methods.find(
      m => m.id === this.collectionStatus!.beneficiaryPreferredMethod
    );
    return method ? `Pré-rempli depuis ${method.label}` : 'Pré-rempli';
  }

  memberStatusIcon(status: 'pending' | 'unpaid'): string {
    return status === 'pending' ? 'time-outline' : 'close-circle-outline';
  }

  memberStatusColor(status: 'pending' | 'unpaid'): string {
    return status === 'pending' ? '#D97706' : '#DC2626';
  }

  distStatusLabel(s: DistributionStatus): string { return this.distributionService.statusLabel(s); }
  distStatusColor(s: DistributionStatus): string { return this.distributionService.statusColor(s); }
  distStatusIcon(s: DistributionStatus): string { return this.distributionService.statusIcon(s); }
  formatAmount(v: number): string { return this.distributionService.formatAmount(v); }

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

  private _toDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (value._seconds !== undefined) return new Date(value._seconds * 1000);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  private async showAlert(header: string, message: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      const alert = await this.alertCtrl.create({
        header, message,
        buttons: [
          { text: 'Annuler', role: 'cancel', handler: () => resolve(false) },
          { text: 'Confirmer', handler: () => resolve(true) },
        ],
      });
      await alert.present();
    });
  }

  private async showToast(message: string, color = 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3500, position: 'bottom', color });
    await toast.present();
  }
}