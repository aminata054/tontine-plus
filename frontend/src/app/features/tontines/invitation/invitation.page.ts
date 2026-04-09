import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonSpinner, ModalController, ToastController
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { ActivatedRoute, Router } from '@angular/router';
import { TontineService } from 'src/app/core/services/tontine.service';
import { QrPanelComponent } from 'src/app/shared/ui/qr-panel/qr-panel.component';
import { SharePanelComponent } from 'src/app/shared/ui/share-panel/share-panel.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { TontineMember } from 'src/app/core/models/tontine.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-invitation',
  templateUrl: './invitation.page.html',
  styleUrls: ['./invitation.page.scss'],
  standalone: true,
  imports: [
    IonSpinner, IonContent, CommonModule, FormsModule,
    PageHeaderComponent, CustomButtonComponent
  ]
})
export class InvitationPage implements OnInit, OnDestroy {

  tontineId: string | null = null;

  // États de la page
  status: 'loading' | 'success' | 'error' = 'loading';
  inviteLink: string | null = null;
  inviteCode: string | null = null;
  qrUrl: string | null = null;

  // Membres en attente
  pendingMembers: TontineMember[] = [];
  pendingStatus: 'loading' | 'success' | 'error' = 'loading';

  // IDs des membres en cours de traitement (pour désactiver les boutons)
  processingIds = new Set<string>();

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tontineService: TontineService,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
  ) { }

  ngOnInit(): void {
    this.tontineId = this.route.snapshot.paramMap.get('id');
    if (!this.tontineId) { this.status = 'error'; return; }

    this.loadInviteData(this.tontineId);
    this.loadPendingMembers(this.tontineId);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.tontineId) {
      this.tontineService.clearPendingCache(this.tontineId);
    }
  }

  // ── Chargement ─────────────────────────────────────────────────────────────

  private loadInviteData(id: string): void {
    this.tontineService.getTontineInvite(id).subscribe({
      next: (res) => {
        if (res.success) {
          this.inviteCode = res.data.inviteCode;
          this.inviteLink = res.data.inviteLink;
          this.qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(res.data.inviteLink)}`;
          this.status = 'success';
        } else {
          this.status = 'error';
        }
      },
      error: () => { this.status = 'error'; },
    });
  }

  private loadPendingMembers(tontineId: string): void {
    this.pendingStatus = 'loading';

    // S'abonner au BehaviorSubject réactif du service
    this.tontineService.pendingMembers$(tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(members => {
        this.pendingMembers = members;
      });

    // Déclencher le premier chargement
    this.tontineService.getPendingMembers(tontineId).subscribe({
      next: () => { this.pendingStatus = 'success'; },
      error: () => { this.pendingStatus = 'error'; },
    });
  }

  // ── Actions membres ────────────────────────────────────────────────────────

  accept(member: TontineMember): void {
    this.validateMember(member, 'accept');
  }

  reject(member: TontineMember): void {
    this.validateMember(member, 'reject');
  }

  private validateMember(member: TontineMember, action: 'accept' | 'reject'): void {
    if (!this.tontineId || this.processingIds.has(member.id)) return;

    this.processingIds.add(member.id);

    this.tontineService.validateMember(this.tontineId, member.id, action).subscribe({
      next: async (res) => {
        this.processingIds.delete(member.id);
        if (res.success) {
          const msg = action === 'accept'
            ? res.data.tontineAutoStarted
              ? `${member.userName ?? 'Membre'} accepté — la tontine a démarré !`
              : `${member.userName ?? 'Membre'} accepté avec succès`
            : `${member.userName ?? 'Membre'} refusé`;
          await this.showToast(msg, action === 'accept' ? 'success' : 'warning');
        }
      },
      error: async () => {
        this.processingIds.delete(member.id);
        await this.showToast('Une erreur est survenue. Réessayez.', 'danger');
      },
    });
  }

  isProcessing(memberId: string): boolean {
    return this.processingIds.has(memberId);
  }

  // ── Modals ─────────────────────────────────────────────────────────────────

  async openQrModal(): Promise<void> {
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

  async openShareModal(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: SharePanelComponent,
      componentProps: { 
        link: this.inviteLink,
        title: 'Partager la tontine',
      },
      breakpoints: [0, 0.6, 0.9],
      initialBreakpoint: 0.6,
      backdropDismiss: true,
      cssClass: 'panel-modal',
    });
    await modal.present();
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  openMemberProfile(memberId: string): void {
    if (this.tontineId) {
      this.router.navigate(['/tontines', this.tontineId, memberId, 'member-profile']);
    }
  }

  // ── Utilitaire ─────────────────────────────────────────────────────────────

  getInitials(name: string | null): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }
}