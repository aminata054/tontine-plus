import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import {
  IonContent, IonIcon, IonSkeletonText,
  ModalController, ToastController,
} from '@ionic/angular/standalone';

import { Tontine, TontineMember, TontineStatus } from 'src/app/core/models/tontine.model';
import { TontineService } from 'src/app/core/services/tontine.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { QrPanelComponent } from 'src/app/shared/ui/qr-panel/qr-panel.component';
import { SharePanelComponent } from 'src/app/shared/ui/share-panel/share-panel.component';
import { AlertModalComponent } from 'src/app/shared/modals/alert-modal/alert-modal.component';

type PageStatus = 'loading' | 'success' | 'error';

@Component({
  selector: 'app-overview',
  templateUrl: './overview.page.html',
  styleUrls: ['./overview.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    IonSkeletonText,
    PageHeaderComponent,
    CustomButtonComponent,
  ],
})
export class OverviewPage implements OnInit, OnDestroy {

  status: PageStatus = 'loading';
  tontine: Tontine | null = null;
  tontineId: string | null = null;

  members: TontineMember[] = [];
  membersStatus: 'loading' | 'success' | 'error' = 'loading';

  inviteLink: string | null = null;
  inviteCode: string | null = null;
  qrUrl: string | null = null;

  private destroy$ = new Subject<void>();
  private uid: string | null = null;

  pendingCount = 0;
  isLaunching = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tontineService: TontineService,
    private authService: AuthService,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
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

  getCurrentUserName(): string {
    const user = this.authService.currentUser;
    return user?.fullName ?? user?.email ?? 'Moi';
  }

  getInitialsFromUser(): string {
    return this.getInitials(
      this.authService.currentUser?.fullName ?? this.authService.currentUser?.email ?? 'Moi'
    );
  }
  // ── Chargement ──────────────────────────────────────────────────────────────

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
            this.loadMembers();
            if (this.isAdmin && this.isPending) this.loadPendingCount();
            if (this.isCreator) this.loadInvite();
          } else {
            this.status = 'error';
          }
        },
        error: () => { this.status = 'error'; },
      });
  }

  private loadMembers(): void {
    this.membersStatus = 'loading';
    this.tontineService.getTontineMembers(this.tontineId!)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.members = res.data
              .filter(m => m.status === 'active')
              .sort((a, b) => {
                const order = { creator: 0, admin: 1, member: 2 };
                return (order[a.role] ?? 3) - (order[b.role] ?? 3);
              });
            this.membersStatus = 'success';
          } else {
            this.membersStatus = 'error';
          }
        },
        error: () => { this.membersStatus = 'error'; },
      });
  }

  private loadPendingCount(): void {
    this.tontineService.getPendingMembers(this.tontineId!).subscribe({
      next: (res) => {
        if (res.success) {
          this.pendingCount = res.data?.length ?? 0;
        }
      },
    });
  }

  private loadInvite(): void {
    this.tontineService.getTontineInvite(this.tontineId!).subscribe({
      next: (res) => {
        if (res.success) {
          this.inviteCode = res.data.inviteCode;
          this.inviteLink = res.data.inviteLink;
          this.qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(res.data.inviteLink)}`;
        }
      },
    });
  }

  // ── Rôle & état ─────────────────────────────────────────────────────────────

  /** L'utilisateur connecté est-il le créateur ? */
  get isCreator(): boolean {
    return this.tontine?.myRole === 'creator';
  }

  get isAdmin(): boolean {
    return this.tontine?.myRole === 'creator' || this.tontine?.myRole === 'admin';
  }

  get isFull(): boolean {
    return !!this.tontine && this.tontine.currentMembers >= this.tontine.totalMembers;
  }

  get isPending(): boolean { return this.tontine?.status === 'pending'; }
  get isActive(): boolean { return this.tontine?.status === 'active'; }
  get isCompleted(): boolean { return this.tontine?.status === 'completed'; }
  get isCancelled(): boolean { return this.tontine?.status === 'cancelled'; }

  /** Peut-on lancer la tontine ? (créateur + pending + pleine) */
  get canLaunch(): boolean {
    return this.isCreator && this.isPending && this.isFull;
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  launchTontine(): void {
    if (!this.tontineId || !this.tontine) return;
    const rotationMethod = this.tontine.rotationMethod;

    if (rotationMethod === 'manual') {
      this.showManualTurnPicker();
      return;
    }

    if (rotationMethod === 'consensual') {
      this.openFirstVote();
      return;
    }

    // random / seniority
    this.isLaunching = true;
    this.tontineService.launchTontine(this.tontineId)
      .pipe(finalize(() => this.isLaunching = false))
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.showToast(`Tour 1 attribué à ${res.data.firstBeneficiary.name} !`);
            this.load();
          } else {
            this.showToast(res.error ?? 'Erreur lors du lancement');
          }
        },
        error: () => this.showToast('Erreur réseau, réessayez'),
      });
  }

  // ── Lancement avec sélection manuelle du bénéficiaire ────────────────────────
  private async showManualTurnPicker(): Promise<void> {
    const completedTurns: string[] = (this.tontine as any)?.completedTurns ?? [];

    // this.members est déjà chargé — on filtre les éligibles
    const selectableMembers = this.members
      .filter(m => !completedTurns.includes(m.userId))
      .map(m => ({
        uid: m.userId,
        name: m.userName ?? m.userId,
      }));

    if (selectableMembers.length === 0) {
      this.showToast('Aucun membre éligible trouvé');
      return;
    }

    const modal = await this.modalCtrl.create({
      component: AlertModalComponent,
      componentProps: {
        type: 'launch',
        title: 'Choisir le 1er bénéficiaire',
        message: 'Sélectionnez le membre qui recevra le pot en premier.',
        selectableMembers,          // ← nom correct attendu par AlertModalComponent
        confirmText: 'Confirmer',
        cancelText: 'Annuler',
        confirmColor: 'primary',
      },
      cssClass: 'alert-modal',
      backdropDismiss: true,
    });

    await modal.present();
    const { data } = await modal.onWillDismiss();

    if (data?.confirmed && data?.selectedMemberUid) {   // ← selectedMemberUid (pas selectedUid)
      this.isLaunching = true;
      this.tontineService.launchTontine(this.tontineId!, data.selectedMemberUid)
        .pipe(finalize(() => this.isLaunching = false))
        .subscribe({
          next: (res) => {
            if (res.success) {
              this.showToast(`Tour 1 attribué à ${res.data.firstBeneficiary.name} !`);
              this.load();
            } else {
              this.showToast(res.error ?? 'Erreur lors du lancement');
            }
          },
          error: () => this.showToast('Erreur réseau'),
        });
    }
  }
  // ── Lancement du vote consensuel pour le tour 1 ───────────────────────────────
  private openFirstVote(): void {
    if (!this.tontineId) return;
    this.isLaunching = true;
    this.tontineService.processNextTurn(this.tontineId)
      .pipe(finalize(() => this.isLaunching = false))
      .subscribe({
        next: (res) => {
          if (res.success && res.data?.voteId) {
            this.showToast('🗳️ Vote ouvert ! Les membres peuvent voter.');
            // Rediriger vers la page de vote
            this.router.navigate([
              '/tontines', this.tontineId, 'vote', res.data.voteId
            ]);
          }
        },
        error: () => this.showToast('Erreur réseau'),
      });
  }

  async showLaunchConfirm(): Promise<void> {
    if (!this.canLaunch || !this.tontine) return;

    // Mode manual → on ouvre directement le sélecteur, pas de modal de confirmation
    if (this.tontine.rotationMethod === 'manual') {
      await this.showManualTurnPicker();
      return;
    }

    // Tous les autres modes modal de confirmation classique
    const rotationMessages: Record<string, string> = {
      random: 'L\'ordre de passage sera tiré au sort automatiquement.',
      seniority: 'L\'ordre sera défini par ancienneté d\'adhésion.',
      consensual: 'Les membres voteront pour désigner le bénéficiaire à chaque tour.',
    };

    const modal = await this.modalCtrl.create({
      component: AlertModalComponent,
      componentProps: {
        type: 'launch',
        title: 'Lancer la tontine',
        message: rotationMessages[this.tontine.rotationMethod] ?? '',
        extraData: [
          { label: 'Membres', value: `${this.tontine.currentMembers}` },
          { label: 'Cotisation', value: `${this.formatAmount(this.tontine.amount)} FCFA` },
          { label: 'Gain/tour', value: `${this.formatAmount(this.tontine.potPerTurn)} FCFA` },
          { label: 'Rotation', value: this.tontineService.rotationLabel(this.tontine.rotationMethod) },
        ],
        confirmText: this.tontine.rotationMethod === 'consensual' ? 'Ouvrir le vote' : 'Lancer',
        cancelText: 'Annuler',
        confirmColor: 'primary',
      },
      cssClass: 'alert-modal',
      backdropDismiss: true,
    });

    await modal.present();
    const { data } = await modal.onWillDismiss();

    if (data?.confirmed) {
      this.launchTontine();   // random / seniority / consensual
    }
  }

  openChat(): void {
    this.router.navigate(['/messages/conversation', this.tontineId]);
  }

  openTontineDetail(): void {
    this.router.navigate(['/tontines', this.tontineId, 'tontine-detail']);
  }
  goToMembers(): void {
    this.router.navigate(['/tontines', this.tontineId, 'members']);
  }

  openMemberProfile(memberId: string): void {
    this.router.navigate(['/tontines', this.tontineId, 'member-profile', memberId]);
  }
  goBack(): void {
    this.router.navigate(['/tabs/tontine']);
  }

  openSettings(): void {
    this.router.navigate(['/tontines', this.tontineId, 'settings']);
  }

  async openInvitations(): Promise<void> {
    this.router.navigate(['/tontines', this.tontineId, 'invitation']);
  }

  async openShareModal(): Promise<void> {
    if (!this.inviteLink) return;
    const modal = await this.modalCtrl.create({
      component: SharePanelComponent,
      componentProps: { inviteLink: this.inviteLink },
      breakpoints: [0, 0.6, 0.9],
      initialBreakpoint: 0.6,
      backdropDismiss: true,
      cssClass: 'panel-modal',
    });
    await modal.present();
  }

  async openQrModal(): Promise<void> {
    if (!this.qrUrl) return;
    const modal = await this.modalCtrl.create({
      component: QrPanelComponent,
      componentProps: { qrUrl: this.qrUrl, inviteCode: this.inviteCode },
      breakpoints: [0, 0.6, 0.9],
      initialBreakpoint: 0.6,
      backdropDismiss: true,
      cssClass: 'panel-modal',
    });
    await modal.present();
  }

  // ── UI helpers ───────────────────────────────────────────────────────────────

  statusLabel(s: TontineStatus): string { return this.tontineService.statusLabel(s); }
  statusColor(s: TontineStatus): string { return this.tontineService.statusColor(s); }

  progress(): number {
    if (!this.tontine?.totalTurns) return 0;
    return Math.min((this.tontine.currentTurn / this.tontine.totalTurns) * 100, 100);
  }

  membersProgress(): number {
    if (!this.tontine?.totalMembers) return 0;
    return Math.min((this.tontine.currentMembers / this.tontine.totalMembers) * 100, 100);
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value._seconds !== undefined) return new Date(value._seconds * 1000);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  nextPaymentLabel(): string {
    if (!this.tontine) return '—';
    if (this.tontine.status === 'completed') return 'Cycle terminé';
    if (this.tontine.status === 'cancelled') return 'Annulée';
    if (this.tontine.status === 'pending') return 'En attente de démarrage';
    const d = this.toDate(this.tontine.nextPaymentDate);
    if (!d) return '—';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  startedAtLabel(): string {
    const d = this.toDate(this.tontine?.startedAt);
    if (!d) return '—';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  createdAtLabel(): string {
    const d = this.toDate(this.tontine?.createdAt);
    if (!d) return '—';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  formatAmount(v: number): string {
    return new Intl.NumberFormat('fr-FR').format(v);
  }

  getInitials(name: string | null | undefined): string {
    return (name ?? '')
      .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  }

  getMemberInitials(member: TontineMember): string {
    return this.getInitials(member.userName);
  }

  private async showToast(msg: string): Promise<void> {
    const t = await this.toastCtrl.create({ message: msg, duration: 2000, position: 'bottom' });
    await t.present();
  }
}