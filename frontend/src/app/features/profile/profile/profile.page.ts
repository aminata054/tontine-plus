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
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { SharePanelComponent } from 'src/app/shared/ui/share-panel/share-panel.component';

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

  showContactSheet = false;

  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private modalCtrl: ModalController,
  ) { }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Chargement ──────────────────────────────────────────────────────────────

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
            // Pas encore chargé depuis le storage — on attend un tick
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

  // ── Helpers ─────────────────────────────────────────────────────────────────

  getInitials(name: string | null | undefined): string {
    return (name ?? '')
      .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  goToMyAccount(): void {
    this.router.navigate(['/profile/account']);
  }

  goToChangePin(): void {
    this.router.navigate(['/profile/change-pin']);
  }

  goToSubscription(): void {
    this.router.navigate(['/profile/subscription']);
  }

  goToHelpCenter(): void {
    this.router.navigate(['/profile/help-center']);
  }

  goToAbout(): void {
    this.router.navigate(['/profile/about']);
  }

  goToFeedback(): void {
    this.router.navigate(['/profile/feedback']);
  }

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
      componentProps: {
        link: shareUrl,
        title: 'Inviter un ami',
        shareText: shareText,
      },
      breakpoints: [0, 0.5, 0.8],
      initialBreakpoint: 0.5,
      backdropDismiss: true,
      cssClass: 'panel-modal',
    });

    await modal.present();
  }

  // ── Contact sheet ────────────────────────────────────────────────────────────

  contactSupport(): void {
    this.showContactSheet = true;
  }

  closeContactSheet(): void {
    this.showContactSheet = false;
  }

  contactViaWhatsapp(): void {
    this.closeContactSheet();
    const phone = '+221XXXXXXXXX'; // TODO : remplacer par le vrai numéro
    window.open(`https://wa.me/${phone}`, '_blank');
  }

  contactViaCall(): void {
    this.closeContactSheet();
    const phone = 'tel:+221XXXXXXXXX'; // TODO : remplacer par le vrai numéro
    window.open(phone);
  }

  // ── Déconnexion ──────────────────────────────────────────────────────────────

  async logout(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Déconnexion',
      message: 'Êtes-vous sûr de vouloir vous déconnecter ?',
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        {
          text: 'Déconnexion',
          role: 'destructive',
          handler: async () => {
            await this.authService.logout();
            this.router.navigate(['/auth/login'], { replaceUrl: true });
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Toast helper ─────────────────────────────────────────────────────────────

  private async showToast(message: string, color: string = 'primary'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
      position: 'top',
    });
    await toast.present();
  }
}