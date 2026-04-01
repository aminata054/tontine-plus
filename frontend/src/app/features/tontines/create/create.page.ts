import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule, ReactiveFormsModule,
  FormBuilder, FormGroup, Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent, IonIcon,
  ToastController, ModalController
} from '@ionic/angular/standalone';

import { TontineService } from 'src/app/core/services/tontine.service';
import { CreateTontinePayload } from 'src/app/core/models/tontine.model';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { StepIndicatorComponent } from 'src/app/shared/ui/step-indicator/step-indicator.component';
import { SelectionCardComponent } from 'src/app/shared/ui/selection-card/selection-card.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { CustomInputComponent } from 'src/app/shared/ui/custom-input/custom-input.component';

import { PremiumModalComponent } from 'src/app/shared/modals/premium-modal/premium-modal.component';

// ─── Types locaux ──────────────────────────────────────────────────────────────

type TontineType = 'rotative' | 'crescendo';
type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
type Visibility = 'private' | 'semi_public' | 'public';
type RotationMethod = 'random' | 'seniority' | 'consensual' | 'manual';
type SecurityModel = 'escrow' | 'direct' | 'blocked_account' | 'solidarity';
type PenaltyType = 'percentage' | 'fixed';
type StepStatus = 'pending' | 'success' | 'error';

interface TypeOption {
  value: TontineType;
  label: string;
  description: string;
  premium: boolean;
}

interface RotationOption {
  value: RotationMethod;
  label: string;
  description: string;
  badge: string;
  premium: boolean;
}

interface SecurityOption {
  value: SecurityModel;
  label: string;
  description: string;
  note: string;
  recommended: boolean;
  premium: boolean;
}

@Component({
  selector: 'app-create',
  templateUrl: './create.page.html',
  styleUrls: ['./create.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonContent,
    IonIcon,
    PageHeaderComponent,
    StepIndicatorComponent,
    SelectionCardComponent,
    CustomButtonComponent,
    CustomInputComponent,
],
})
export class CreatePage implements OnInit {

  // ── Étape courante (1–7) + état final ──────────────────────
  currentStep = 1;
  readonly TOTAL_STEPS = 7;
  stepStatus: StepStatus = 'pending';

  // ── Données du formulaire ───────────────────────────────────
  selectedType: TontineType = 'rotative';
  selectedFrequency: Frequency | null = null;
  selectedVisibility: Visibility = 'private';
  selectedPaymentDay: number | null = null;
  selectedRotation: RotationMethod = 'random';
  selectedSecurity: SecurityModel = 'escrow';
  selectedPenaltyType: PenaltyType = 'percentage';
  selectedPenaltyValue = 0;
  selectedGracePeriod = 0;
  selectedAutoExclusion: number | null = 14;
  earlyExitAllowed = false;
  earlyExitPenaltyType: PenaltyType = 'percentage';
  earlyExitPenaltyValue = 0;
  modificationThreshold: 50 | 75 | 100 = 75;
  guaranteeAmount = 0;

  // Helpers string pour app-custom-input ([(value)] ne gère que string)
  get selectedPenaltyValueStr(): string {
    return this.selectedPenaltyValue > 0 ? String(this.selectedPenaltyValue) : '';
  }
  set selectedPenaltyValueStr(v: string) {
    this.selectedPenaltyValue = Number(v) || 0;
  }

  get guaranteeAmountStr(): string {
    return this.guaranteeAmount > 0 ? String(this.guaranteeAmount) : '';
  }
  set guaranteeAmountStr(v: string) {
    this.guaranteeAmount = Number(v) || 0;
  }

  // Checkboxes récapitulatif
  confirmedRules = false;
  confirmedPayment = false;

  // Résultat création
  createdTontineId: string | null = null;
  createdInviteCode: string | null = null;
  createdInviteLink: string | null = null;
  createdQrUrl: string | null = null;
  isSubmitting = false;
  showQrPanel = false;
  showSharePanel = false;

  // Preview image
  iconPreviewUrl: string | null = null;
  // URL stockée séparément (pas dans le form pour ne pas bloquer la validation)
  iconUrl: string | null = null;

  // ── Forms ───────────────────────────────────────────────────
  step2Form!: FormGroup;
  step3Form!: FormGroup;

  // ── Options statiques ───────────────────────────────────────
  typeOptions: TypeOption[] = [
    {
      value: 'rotative',
      label: 'Rotative classique',
      description: "Chaque membre verse un montant déterminé, et l'un des cotisants, à tour de rôle, reçoit l'ensemble des cotisations de cette fois.",
      premium: false,
    },
    {
      value: 'crescendo',
      label: 'Crescendo',
      description: "Chaque membre verse un montant déterminé, et l'un des cotisants, à tour de rôle, reçoit l'ensemble des cotisations de cette fois.",
      premium: false,
    },
  ];

  quickAmounts = [5_000, 10_000, 15_000, 25_000, 50_000];

  frequencies: { value: Frequency; label: string }[] = [
    { value: 'daily', label: 'Quotidienne' },
    { value: 'weekly', label: 'Hebdomadaire' },
    { value: 'biweekly', label: 'Bimensuelle' },
    { value: 'monthly', label: 'Mensuelle' },
  ];

  weekDays = [
    { label: 'Lun', value: 1 },
    { label: 'Mar', value: 2 },
    { label: 'Mer', value: 3 },
    { label: 'Jeu', value: 4 },
    { label: 'Ven', value: 5 },
    { label: 'Sam', value: 6 },
    { label: 'Dim', value: 0 },
  ];

  rotationOptions: RotationOption[] = [
    {
      value: 'random',
      label: 'Aléatoire',
      description: 'Tirage au sort équitable à la validation de tous les membres',
      badge: '100 % Transparent',
      premium: false,
    },
    {
      value: 'seniority',
      label: 'Ancienneté',
      description: "Pot donné selon l'ordre d'arrivée dans le groupe",
      badge: '100 % Transparent',
      premium: false,
    },
    {
      value: 'consensual',
      label: 'Consensuel',
      description: 'Tirage au sort équitable à la validation de tous les membres',
      badge: '100 % Transparent',
      premium: true,
    },
    {
      value: 'manual',
      label: 'Prédefini par moi',
      description: 'Tirage au sort équitable à la validation de tous les membres',
      badge: '100 % Transparent',
      premium: true,
    },
  ];

  gracePeriodOptions = [0, 3, 2, 5, 7, 10];
  autoExclusionOptions: (number | null)[] = [7, 14, 30, null];
  penaltyPercentOptions = [0, 2, 5, 10];

  securityOptions: SecurityOption[] = [
    {
      value: 'escrow',
      label: 'Escrow collectif',
      description: 'Vos cotisations vont dans un wallet sécurisé et la distribution se fait automatiquement',
      note: '*Sécurité maximale',
      recommended: true,
      premium: false,
    },
    {
      value: 'direct',
      label: 'Virement direct',
      description: "Chaque membre paie directement le bénéficiaire du tour et l'application ne touche jamais l'argent",
      note: '*Nécessite la confiance entre membres',
      recommended: false,
      premium: false,
    },
    {
      value: 'blocked_account',
      label: 'Compte bloqué',
      description: "Les fonds sont bloqués sur un compte dédié jusqu'à la distribution",
      note: '*Sécurité intermédiaire',
      recommended: false,
      premium: true,
    },
    {
      value: 'solidarity',
      label: 'Solidarité',
      description: 'Chaque membre verse une caution remboursable en fin de cycle',
      note: '*Caution requise',
      recommended: false,
      premium: true,
    },
  ];

  visibilityOptions: { value: Visibility; label: string }[] = [
    { value: 'private', label: 'Privée - Sur invitation' },
    { value: 'semi_public', label: 'Semi-publique' },
    { value: 'public', label: 'Publique' },
  ];

  showFrequencyDropdown = false;
  showVisibilityDropdown = false;

  // ── Constructeur ────────────────────────────────────────────
  constructor(
    private fb: FormBuilder,
    private router: Router,
    private tontineService: TontineService,
    private toastCtrl: ToastController,
    private modalCtrl: ModalController,
    ) { }

  ngOnInit(): void {
    this.step2Form = this.fb.group({
      
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
    });

    this.step3Form = this.fb.group({
      amount: [null, [Validators.required, Validators.min(1000)]],
      totalMembers: [null, [Validators.required, Validators.min(2), Validators.max(50)]],
    });
  }

  // ── Navigation ──────────────────────────────────────────────

  get progress(): number {
    return (this.currentStep / this.TOTAL_STEPS) * 100;
  }

  nextStep(): void {
    if (!this.canProceed()) return;
    if (this.currentStep < this.TOTAL_STEPS) {
      this.currentStep++;
      this.closeDropdowns();
    } else {
      this.submit();
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.closeDropdowns();
    } else {
      this.router.navigate(['/tabs/tontine']);
    }
  }

  canProceed(): boolean {
    switch (this.currentStep) {
      case 1: return !!this.selectedType;
      case 2: return this.step2Form.valid;
      case 3:
        return (
          this.step3Form.valid &&
          !!this.selectedFrequency &&
          (
            this.selectedFrequency !== 'weekly' ||
            this.selectedPaymentDay !== null
          )
        );
      case 4: return !!this.selectedRotation;
      case 5: return true;
      case 6: return !!this.selectedSecurity;
      case 7: return this.confirmedRules && this.confirmedPayment;
      default: return true;
    }
  }

  // ── Étape 1 — Type ──────────────────────────────────────────

  selectType(type: TontineType): void {
    this.selectedType = type;
  }

  // ── Étape 2 — Infos de base ─────────────────────────────────

  onIconPick(): void {
    this.iconPreviewUrl = 'https://picsum.photos/seed/tontine/200';
    this.iconUrl = this.iconPreviewUrl;
  }

  // ── Étape 3 — Financier ─────────────────────────────────────

  selectQuickAmount(amount: number): void {
    this.step3Form.patchValue({ amount });
  }

  selectFrequency(freq: Frequency): void {
    this.selectedFrequency = freq;
    this.selectedPaymentDay = null;
    this.showFrequencyDropdown = false;
  }

  selectPaymentDay(day: number): void {
    this.selectedPaymentDay = day;
  }

  get showDayPicker(): boolean {
    return this.selectedFrequency === 'weekly';
  }

  get potPerTurn(): number {
    const a = this.step3Form.value.amount ?? 0;
    const m = this.step3Form.value.totalMembers ?? 0;
    return a * m;
  }

  // ── Étape 4 — Rotation ──────────────────────────────────────

  selectRotation(r: RotationMethod): void {
    this.selectedRotation = r;
  }

  // ── Étape 5 — Règles ────────────────────────────────────────

  selectGrace(v: number): void { this.selectedGracePeriod = v; }
  selectAutoExclusion(v: number | null): void { this.selectedAutoExclusion = v; }
  selectPenaltyPercent(v: number): void { this.selectedPenaltyValue = v; }

  autoExclusionLabel(v: number | null): string {
    return v === null ? 'Jamais' : `${v} jours`;
  }

  // ── Étape 6 — Sécurité ──────────────────────────────────────

  selectSecurity(s: SecurityModel): void {
    this.selectedSecurity = s;
  }

  // ── Étape 7 — Labels récapitulatif ──────────────────────────

  get visibilityLabel(): string {
    return this.visibilityOptions.find(v => v.value === this.selectedVisibility)?.label ?? '—';
  }

  get frequencyLabel(): string {
    return this.frequencies.find(f => f.value === this.selectedFrequency)?.label ?? '—';
  }

  get rotationLabel(): string {
    return this.rotationOptions.find(r => r.value === this.selectedRotation)?.label ?? '—';
  }

  get securityLabel(): string {
    return this.securityOptions.find(s => s.value === this.selectedSecurity)?.label ?? '—';
  }

  get cycleDuration(): string {
    const m = this.step3Form.value.totalMembers;
    if (!m) return '—';
    switch (this.selectedFrequency) {
      case 'monthly': return `${m} mois`;
      case 'weekly': return `${m} semaines`;
      case 'biweekly': return `${m * 2} semaines`;
      case 'daily': return `${m} jours`;
      default: return '—';
    }
  }

  get penaltyLabel(): string {
    if (this.selectedPenaltyValue === 0) return 'Aucune';
    return this.selectedPenaltyType === 'percentage'
      ? `${this.selectedPenaltyValue}% par retard`
      : `${this.selectedPenaltyValue} FCFA/jour`;
  }

  get earlyExitLabel(): string {
    return this.earlyExitAllowed ? 'Autorisée avec vote' : 'Non autorisée';
  }

  // ── Helpers dropdowns ───────────────────────────────────────

  getVisibilityLabel(): string {
    if (!this.selectedVisibility) return 'Choisir une visibilité';
    return this.visibilityOptions.find(v => v.value === this.selectedVisibility)?.label
      ?? 'Choisir une visibilité';
  }

  getFrequencyLabel(): string {
    if (!this.selectedFrequency) return 'Choisir une fréquence';
    return this.frequencies.find(f => f.value === this.selectedFrequency)?.label
      ?? 'Choisir une fréquence';
  }

  selectVisibility(v: Visibility): void {
    this.selectedVisibility = v;
    this.showVisibilityDropdown = false;
  }

  goToModify(): void {
    this.currentStep = 1;
  }

  // ── Soumission ──────────────────────────────────────────────

  submit(): void {
    if (!this.canProceed() || this.isSubmitting) return;
    this.isSubmitting = true;

    const payload: CreateTontinePayload = {
      type: this.selectedType,
      name: this.step2Form.value.name.trim(),
      description: this.step2Form.value.description || undefined,
      iconUrl: this.iconUrl || undefined,
      visibility: this.selectedVisibility,
      amount: Number(this.step3Form.value.amount),
      frequency: this.selectedFrequency!,
      paymentDay: this.selectedPaymentDay ?? undefined,
      totalMembers: Number(this.step3Form.value.totalMembers),
      rotationMethod: this.selectedRotation,
      gracePeriodDays: this.selectedGracePeriod,
      penaltyType: this.selectedPenaltyType,
      penaltyValue: this.selectedPenaltyValue,
      autoExclusionDays: this.selectedAutoExclusion ?? undefined,
      earlyExitAllowed: this.earlyExitAllowed,
      earlyExitPenaltyType: this.earlyExitAllowed ? this.earlyExitPenaltyType : undefined,
      earlyExitPenaltyValue: this.earlyExitAllowed ? this.earlyExitPenaltyValue : undefined,
      modificationThreshold: this.modificationThreshold,
      securityModel: this.selectedSecurity,
      guaranteeAmount: this.selectedSecurity === 'solidarity' ? this.guaranteeAmount : undefined,
    };

    this.tontineService.createTontine(payload).subscribe({
      next: (res: any) => {
        this.isSubmitting = false;
        if (res.success) {
          this.router.navigate(['/tontines', res.data.tontineId, 'success']);
        } else {
          this.stepStatus = 'error';
          this.currentStep = 8;
        }
      },
      error: () => {
        this.isSubmitting = false;
        this.stepStatus = 'error';
        this.currentStep = 8;
      },
    });
  }

  // ── Actions post-création ───────────────────────────────────

  shareLink(): void { this.showSharePanel = true; }
  showQr(): void { this.showQrPanel = true; }
  closeQr(): void { this.showQrPanel = false; }
  closeShare(): void { this.showSharePanel = false; }

  copyLink(): void {
    if (this.createdInviteLink) {
      navigator.clipboard.writeText(this.createdInviteLink);
      this.showToast('Lien copié !');
    }
  }

  shareVia(platform: string): void {
    const link = encodeURIComponent(this.createdInviteLink ?? '');
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${link}`,
      twitter: `https://twitter.com/intent/tweet?url=${link}`,
      gmail: `mailto:?body=${link}`,
      telegram: `https://t.me/share/url?url=${link}`,
      snapchat: `https://www.snapchat.com/share?url=${link}`,
    };
    if (urls[platform]) window.open(urls[platform], '_blank');
  }

  downloadQr(): void {
    if (this.createdQrUrl) {
      const a = document.createElement('a');
      a.href = this.createdQrUrl;
      a.download = `qr-${this.createdInviteCode}.png`;
      a.click();
    }
  }

  goToList(): void {
    this.router.navigate(['/tabs/tontine']);
  }

  retry(): void {
    this.stepStatus = 'pending';
    this.currentStep = 7;
    this.isSubmitting = false;
    this.confirmedRules = false;
    this.confirmedPayment = false;
  }

  // ── Modale Premium ───────────────────────────────────────────
  
  async openPremiumModal(title: string = '', description: string = '') {
    const modal = await this.modalCtrl.create({
      component: PremiumModalComponent,
      componentProps: {
        title: title || 'Fonctionnalité Premium',
        description: description || 'Cette fonctionnalité est disponible uniquement avec un abonnement Premium.',
      },
      breakpoints: [0.6, 0.9],      
      initialBreakpoint: 0.6,
      backdropDismiss: true,
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();
    if (data?.action === 'subscribe') {
      console.log('Utilisateur veut s\'abonner');
      // Tu peux rediriger vers la page d'abonnement ici
    }
  }

  // ── Utilitaires ─────────────────────────────────────────────

  formatAmount(v: number): string {
    return new Intl.NumberFormat('fr-FR').format(v);
  }

  private closeDropdowns(): void {
    this.showFrequencyDropdown = false;
    this.showVisibilityDropdown = false;
  }

  private async showToast(msg: string): Promise<void> {
    const t = await this.toastCtrl.create({
      message: msg,
      duration: 2000,
      position: 'bottom',
    });
    await t.present();
  }
}