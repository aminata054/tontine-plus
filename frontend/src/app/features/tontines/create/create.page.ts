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
import {
  CreateTontinePayload,
  EarlyExitMode,
  EarlyExitPenalty,
  Frequency,
  RotationMethod,
  SecurityModel,
  TontineType,
  TontineVisibility,
} from 'src/app/core/models/tontine.model';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { StepIndicatorComponent } from 'src/app/shared/ui/step-indicator/step-indicator.component';
import { SelectionCardComponent } from 'src/app/shared/ui/selection-card/selection-card.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { CustomInputComponent } from 'src/app/shared/ui/custom-input/custom-input.component';
import { PremiumModalComponent } from 'src/app/shared/modals/premium-modal/premium-modal.component';
import { SubscriptionService } from 'src/app/core/services/subscription.service';

// ─── Types locaux ──────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'success' | 'error';

interface TypeOption {
  value: TontineType;
  label: string;
  description: string;
  example: string;
  premium: boolean;
  locked: boolean;
}

interface RotationOption {
  value: RotationMethod;
  label: string;
  description: string;
  badge: string;
  info?: string;
  premium: boolean;
  locked: boolean;
}

interface SecurityOption {
  value: SecurityModel;
  label: string;
  description: string;
  features: string[];
  note: string;
  recommended: boolean;
  premium: boolean;
  locked: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

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

  isPremium = false;

  // ── Navigation ──────────────────────────────────────────────────────────────
  currentStep = 1;
  readonly TOTAL_STEPS = 7;
  stepStatus: StepStatus = 'pending';
  isSubmitting = false;

  // ── Étape 1 — Type ──────────────────────────────────────────────────────────
  selectedType: TontineType = 'rotative';

  // ── Étape 2 — Infos de base ─────────────────────────────────────────────────
  selectedVisibility: TontineVisibility = 'private';
  iconPreviewUrl: string | null = null;
  iconUrl: string | null = null;
  showVisibilityDropdown = false;

  // ── Étape 3 — Finance ───────────────────────────────────────────────────────
  selectedFrequency: Frequency | null = null;
  selectedPaymentDay: number | null = null;
  showFrequencyDropdown = false;

  // ── Étape 4 — Rotation ──────────────────────────────────────────────────────
  selectedRotation: RotationMethod = 'random';

  // ── Étape 5 — Règles ────────────────────────────────────────────────────────
  selectedGracePeriod: 0 | 2 | 3 | 5 | 7 = 0;
  selectedPenaltyType: 'percentage' | 'fixed' = 'percentage';
  selectedPenaltyValue = 0;
  selectedAutoExclusion: 7 | 14 | 30 | null = 14;

  // Sortie anticipée — 3 modes
  selectedEarlyExit: EarlyExitMode = 'locked';
  selectedEarlyExitPenalty: EarlyExitPenalty = 'guarantee';

  modificationThreshold: 75 | 100 = 75;

  // Helper string pour custom-input (fixed penalty)
  get selectedPenaltyValueStr(): string {
    return this.selectedPenaltyValue > 0 ? String(this.selectedPenaltyValue) : '';
  }
  set selectedPenaltyValueStr(v: string) {
    this.selectedPenaltyValue = Number(v) || 0;
  }

  // ── Étape 6 — Sécurité ──────────────────────────────────────────────────────
  selectedSecurity: SecurityModel = 'escrow';
  guaranteeAmount = 0;

  get guaranteeAmountStr(): string {
    return this.guaranteeAmount > 0 ? String(this.guaranteeAmount) : '';
  }
  set guaranteeAmountStr(v: string) {
    this.guaranteeAmount = Number(v) || 0;
  }

  // ── Étape 7 — Récapitulatif ─────────────────────────────────────────────────
  confirmedRules = false;
  confirmedPayment = false;

  // ── Résultat ────────────────────────────────────────────────────────────────
  createdTontineId: string | null = null;
  createdInviteCode: string | null = null;
  createdInviteLink: string | null = null;

  // ── Forms ───────────────────────────────────────────────────────────────────
  step2Form!: FormGroup;
  step3Form!: FormGroup;

  // ── Options statiques ───────────────────────────────────────────────────────

  get typeOptions(): TypeOption[] {
    return [
      {
        value: 'rotative',
        label: 'Rotative classique',
        description: 'Chacun reçoit le pot à tour de rôle',
        example: '12 personnes × 10 000 FCFA = 120 000 FCFA/tour',
        premium: false,
        locked: false,
      },
      {
        value: 'crescendo',
        label: 'Crescendo',
        description: 'Les montants augmentent progressivement',
        example: '1er tour : 50k, 2e tour : 60k...',
        premium: false,
        locked: false,
      },
      {
        value: 'solidarity',
        label: 'Solidarité',
        description: 'Pot commun pour projets collectifs',
        example: '',
        premium: true,
        locked: !this.isPremium, // ← relit isPremium à chaque fois
      },
      {
        value: 'savings_goal',
        label: 'Épargne objectif',
        description: 'Économiser ensemble pour un objectif',
        example: '',
        premium: true,
        locked: !this.isPremium,
      },
    ];
  }


  visibilityOptions: { value: TontineVisibility; label: string; description: string }[] = [
    { value: 'private', label: 'Privée', description: 'Sur invitation uniquement' },
    { value: 'semi_public', label: 'Semi-publique', description: 'Lien partageable' },
    { value: 'public', label: 'Publique', description: 'Annuaire (bientôt disponible)' },
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

  get rotationOptions(): RotationOption[] {
    return [
      {
        value: 'random',
        label: 'Aléatoire',
        description: 'Tirage au sort équitable à la validation de tous les membres',
        badge: '100 % Transparent',
        premium: false,
        locked: false,
      },
      {
        value: 'seniority',
        label: 'Ancienneté',
        description: "Ordre d'arrivée dans la tontine",
        badge: '100 % Transparent',
        info: 'Le créateur en premier, puis selon les inscriptions',
        premium: false,
        locked: false,
      },
      {
        value: 'consensual',
        label: 'Consensuel',
        description: "L'ordre sera décidé par vote",
        badge: '100 % Transparent',
        info: "Nécessite 75% d'approbation",
        premium: true,
        locked: !this.isPremium,
      },
      {
        value: 'manual',
        label: 'Prédéfini par moi',
        description: "Je définis l'ordre manuellement",
        badge: '100 % Transparent',
        premium: true,
        locked: !this.isPremium,
      },
    ];
  }


  // Délai de grâce — valeurs exactes acceptées par le backend
  gracePeriodOptions: (0 | 2 | 3 | 5 | 7)[] = [0, 2, 3, 5, 7];
  penaltyPercentOptions: (0 | 2 | 5 | 10)[] = [0, 2, 5, 10];
  // Exclusion auto — valeurs exactes acceptées par le backend
  autoExclusionOptions: (7 | 14 | 30 | null)[] = [7, 14, 30, null];

  // Sortie anticipée — 3 modes
  earlyExitOptions: { value: EarlyExitMode; label: string }[] = [
    { value: 'penalty', label: 'Oui, avec pénalité' },
    { value: 'vote', label: 'Oui, après vote majoritaire' },
    { value: 'locked', label: 'Non (verrouillage total)' },
  ];

  // Pénalité de sortie
  earlyExitPenaltyOptions: { value: EarlyExitPenalty; label: string }[] = [
    { value: 'guarantee', label: 'Perte de la caution' },
    { value: 'paid_contributions', label: 'Perte des cotisations déjà payées' },
  ];

  get securityOptions(): SecurityOption[] {
    return [
      {
        value: 'escrow',
        label: 'Escrow collectif',
        description: 'Vos cotisations vont dans un wallet sécurisé partagé',
        features: [
          'Distribution automatique impossible à bloquer',
          "Aucun humain ne peut toucher l'argent avant la date",
        ],
        note: 'Sécurité maximale',
        recommended: true,
        premium: false,
        locked: false,
      },
      {
        value: 'direct',
        label: 'Virement direct tour par tour',
        description: 'Chaque membre paie directement le bénéficiaire du tour',
        features: [
          "L'application ne touche jamais l'argent",
          'Notifications et rappels automatiques',
        ],
        note: 'Nécessite la confiance entre membres',
        recommended: false,
        premium: false,
        locked: false,
      },
      {
        value: 'solidarity_guarantee',
        label: 'Garantie solidaire + pénalités',
        description: 'Chaque membre bloque une caution remboursable en fin de cycle',
        features: [
          'Pénalités automatiques en cas de retard',
          'Caution récupérée en fin de cycle',
        ],
        note: 'Caution requise',
        recommended: false,
        premium: true,
        locked: !this.isPremium,
      },
    ];
  }

  // ── Constructeur ────────────────────────────────────────────────────────────

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private tontineService: TontineService,
    private subscriptionService: SubscriptionService,
    private toastCtrl: ToastController,
    private modalCtrl: ModalController,
  ) { }

  ngOnInit(): void {
    this.isPremium = this.subscriptionService.currentHasAccess;

    // Se tenir à jour si ça change
    this.subscriptionService.hasAccess$.subscribe(hasAccess => {
      this.isPremium = hasAccess;
    });
    
    // Si le cache est vide (premier chargement), charger depuis l'API
    if (!this.subscriptionService['subscriptionSubject'].getValue()) {
      this.subscriptionService.getMySubscription().subscribe();
    }

    this.step2Form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
    });

    this.step3Form = this.fb.group({
      amount: [null, [Validators.required, Validators.min(1000)]],
      totalMembers: [null, [Validators.required, Validators.min(2), Validators.max(50)]],
    });
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

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
      case 1: {
        if (!this.selectedType) return false;
        // Bloquer si le type sélectionné est locked
        return !this.typeOptions.find(t => t.value === this.selectedType)?.locked;
      }
      case 2: return this.step2Form.valid;
      case 3:
        return (
          this.step3Form.valid &&
          !!this.selectedFrequency &&
          (this.selectedFrequency !== 'weekly' || this.selectedPaymentDay !== null)
        );
      case 4: {
        if (!this.selectedRotation) return false;
        return !this.rotationOptions.find(r => r.value === this.selectedRotation)?.locked;
      }

      case 5:
        // Si sortie avec pénalité, le type de pénalité doit être choisi
        if (this.selectedEarlyExit === 'penalty' && !this.selectedEarlyExitPenalty) return false;
        // Si pénalité fixe, le montant doit être > 0
        if (this.selectedPenaltyType === 'fixed' && this.selectedPenaltyValue <= 0) return false;
        return true;
      case 6: {
        if (!this.selectedSecurity) return false;
        if (this.securityOptions.find(s => s.value === this.selectedSecurity)?.locked) return false;
        if (this.selectedSecurity === 'solidarity_guarantee' && this.guaranteeAmount <= 0) return false;
        return true;
      }
      case 7: return this.confirmedRules && this.confirmedPayment;
      default: return true;
    }
  }

  // ── Étape 1 — Type ──────────────────────────────────────────────────────────

  selectType(type: TontineType): void {
    const option = this.typeOptions.find(t => t.value === type);
    if (option?.locked) {
      this.openPremiumModal(option.label, option.description);
      return;
    }
    this.selectedType = type;
  }
  // ── Étape 2 — Infos de base ─────────────────────────────────────────────────

  onIconPick(): void {
    // Remplacer par un vrai sélecteur d'image
    this.iconPreviewUrl = 'https://picsum.photos/seed/tontine/200';
    this.iconUrl = this.iconPreviewUrl;
  }

  selectVisibility(v: TontineVisibility): void {
    this.selectedVisibility = v;
    this.showVisibilityDropdown = false;
  }

  getVisibilityLabel(): string {
    return this.visibilityOptions.find(v => v.value === this.selectedVisibility)?.label
      ?? 'Choisir une visibilité';
  }

  // ── Étape 3 — Finance ───────────────────────────────────────────────────────

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

  getFrequencyLabel(): string {
    if (!this.selectedFrequency) return 'Choisir une fréquence';
    return this.frequencies.find(f => f.value === this.selectedFrequency)?.label
      ?? 'Choisir une fréquence';
  }

  // ── Étape 4 — Rotation ──────────────────────────────────────────────────────

  selectRotation(r: RotationMethod): void {
    const option = this.rotationOptions.find(o => o.value === r);
    if (option?.locked) {
      this.openPremiumModal(option.label, option.description);
      return;
    }
    this.selectedRotation = r;
  }

  // ── Étape 5 — Règles ────────────────────────────────────────────────────────

  selectGrace(v: 0 | 2 | 3 | 5 | 7): void {
    this.selectedGracePeriod = v;
  }

  selectPenaltyPercent(v: 0 | 2 | 5 | 10): void {
    this.selectedPenaltyValue = v;
  }

  selectAutoExclusion(v: 7 | 14 | 30 | null): void {
    this.selectedAutoExclusion = v;
  }

  selectEarlyExit(mode: EarlyExitMode): void {
    this.selectedEarlyExit = mode;
    // Réinitialise le type de pénalité si on change de mode
    if (mode !== 'penalty') this.selectedEarlyExitPenalty = 'guarantee';
  }

  selectEarlyExitPenalty(type: EarlyExitPenalty): void {
    this.selectedEarlyExitPenalty = type;
  }

  autoExclusionLabel(v: number | null): string {
    return v === null ? 'Jamais (vote requis)' : `${v} jours`;
  }

  // ── Étape 6 — Sécurité ──────────────────────────────────────────────────────

  selectSecurity(s: SecurityModel): void {
    const option = this.securityOptions.find(o => o.value === s);
    if (option?.locked) {
      this.openPremiumModal(option.label, option.description);
      return;
    }
    this.selectedSecurity = s;
    if (s !== 'solidarity_guarantee') this.guaranteeAmount = 0;
  }

  // ── Labels récapitulatif ────────────────────────────────────────────────────

  get visibilityLabel(): string {
    return this.tontineService.visibilityLabel(this.selectedVisibility);
  }

  get frequencyLabel(): string {
    return this.selectedFrequency
      ? this.tontineService.frequencyLabel(this.selectedFrequency)
      : '—';
  }

  get rotationLabel(): string {
    return this.tontineService.rotationLabel(this.selectedRotation);
  }

  get securityLabel(): string {
    return this.tontineService.securityLabel(this.selectedSecurity);
  }

  get typeLabel(): string {
    return this.tontineService.typeLabel(this.selectedType);
  }

  get earlyExitLabel(): string {
    return this.tontineService.earlyExitLabel(this.selectedEarlyExit);
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
      ? `${this.selectedPenaltyValue}% par jour`
      : `${this.formatAmount(this.selectedPenaltyValue)} FCFA/jour`;
  }

  // ── Soumission ──────────────────────────────────────────────────────────────

  submit(): void {
    if (!this.canProceed() || this.isSubmitting) return;
    this.isSubmitting = true;

    const payload: CreateTontinePayload = {
      // Identité
      type: this.selectedType,
      name: this.step2Form.value.name.trim(),
      description: this.step2Form.value.description || undefined,
      iconUrl: this.iconUrl || undefined,
      visibility: this.selectedVisibility,

      // Finance
      amount: Number(this.step3Form.value.amount),
      frequency: this.selectedFrequency!,
      paymentDay: this.selectedPaymentDay ?? undefined,
      totalMembers: Number(this.step3Form.value.totalMembers),

      // Rotation
      rotationMethod: this.selectedRotation,

      // Règles — retards
      gracePeriodDays: this.selectedGracePeriod,
      penaltyType: this.selectedPenaltyType,
      penaltyValue: this.selectedPenaltyValue,
      autoExclusionDays: this.selectedAutoExclusion,

      // Règles — sortie anticipée
      earlyExitAllowed: this.selectedEarlyExit,
      earlyExitPenaltyType: this.selectedEarlyExit === 'penalty'
        ? this.selectedEarlyExitPenalty
        : undefined,

      // Gouvernance
      modificationThreshold: this.modificationThreshold,

      // Sécurité
      securityModel: this.selectedSecurity,
      guaranteeAmount: this.selectedSecurity === 'solidarity_guarantee'
        ? this.guaranteeAmount
        : undefined,
    };

    this.tontineService.createTontine(payload).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        if (res.success) {
          this.createdTontineId = res.data.tontineId;
          this.createdInviteCode = res.data.inviteCode;
          this.createdInviteLink = res.data.inviteLink;
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

  // ── Actions post-création ───────────────────────────────────────────────────

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
    };
    if (urls[platform]) window.open(urls[platform], '_blank');
  }

  goToList(): void {
    this.router.navigate(['/tabs/tontine']);
  }

  goToModify(): void {
    this.currentStep = 1;
  }

  retry(): void {
    this.stepStatus = 'pending';
    this.currentStep = 7;
    this.isSubmitting = false;
    this.confirmedRules = false;
    this.confirmedPayment = false;
  }

  // ── Modale Premium ──────────────────────────────────────────────────────────

  async openPremiumModal(title = '', description = ''): Promise<void> {
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
      // Rediriger vers la page d'abonnement
    }
  }

  // ── Utilitaires ─────────────────────────────────────────────────────────────

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