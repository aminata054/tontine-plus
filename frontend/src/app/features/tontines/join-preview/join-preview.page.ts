import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { Frequency, RotationMethod, SecurityModel, TontinePreview, TontineType } from 'src/app/core/models/tontine.model';
import { TontineService } from 'src/app/core/services/tontine.service';
import { IonToolbar, IonContent, IonSpinner, IonIcon, IonButton, IonFooter } from "@ionic/angular/standalone";
import { PageHeaderComponent } from "src/app/shared/ui/page-header/page-header.component";
import { CustomButtonComponent } from "src/app/shared/ui/custom-button/custom-button.component";
import { StateScreenComponent } from "src/app/shared/ui/state-screen/state-screen.component";

@Component({
  selector: 'app-join-preview',
  templateUrl: './join-preview.page.html',
  styleUrls: ['./join-preview.page.scss'],
  standalone: true,
  imports: [CommonModule, IonFooter, IonIcon, IonSpinner, IonContent, IonToolbar, PageHeaderComponent, CustomButtonComponent, StateScreenComponent]
})
export class JoinPreviewPage implements OnInit {

  preview: TontinePreview | undefined = undefined;
  loading = true;
  joining = false;
  error: string | null = null;

  confirmedRules = false;
  confirmedPayment = false;

  private inviteCode = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private tontineService: TontineService,
  ) { }

  ngOnInit(): void {
    // Récupérer le code depuis :
    // - Les query params (?code=ABC123) si lien web
    // - Les path params (/join/ABC123) si deep link
    this.inviteCode =
      this.route.snapshot.paramMap.get('code') ??
      this.route.snapshot.queryParamMap.get('code') ??
      '';

    if (!this.inviteCode) {
      this.error = 'Lien d\'invitation invalide';
      this.loading = false;
      return;
    }

    this.loadPreview();
  }

  private loadPreview(): void {
    this.loading = true;
    this.error = null;

    this.tontineService.getJoinPreview(this.inviteCode).subscribe({
      next: (res) => {
        this.preview = res.data;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error ?? 'Impossible de charger les informations de la tontine';
        this.loading = false;
      },
    });
  }

  canJoin(): boolean {
    return this.confirmedRules && this.confirmedPayment;
  }

  async onJoin(): Promise<void> {
    if (!this.preview) return;

    if (!this.canJoin()) {
      const toast = await this.toastCtrl.create({
        message: 'Veuillez accepter les règles et les obligations',
        duration: 2000,
        color: 'warning',
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    const isPrivate = this.preview.visibility === 'private';

    const alert = await this.alertCtrl.create({
      header: 'Confirmer',
      message: isPrivate
        ? `Envoyer une demande pour rejoindre "${this.preview.name}" ?`
        : `Rejoindre "${this.preview.name}" maintenant ?`,
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        {
          text: isPrivate ? 'Envoyer la demande' : 'Rejoindre',
          handler: () => this.confirmJoin(),
        },
      ],
    });

    await alert.present();
  }

  private confirmJoin(): void {
    this.joining = true;

    this.tontineService.joinTontine(this.inviteCode).subscribe({
      next: (res) => {
        this.joining = false;

        if (res.data.autoAccepted) {
          // Accepté directement page succès avec navigation vers la tontine
          this.router.navigate(['/tontines/join-state'], {
            replaceUrl: true,
            state: {
              tontineId: res.data.tontineId,
              tontineName: this.preview?.name ?? '',
              autoAccepted: true,
            },
          });
        } else {
          // En attente de validation → page succès avec message d'attente
          this.router.navigate(['/tontines/join-state'], {
            replaceUrl: true,
            state: {
              tontineId: res.data.tontineId,
              tontineName: this.preview?.name ?? '',
              autoAccepted: false,
            },
          });
        }
      },
      error: async (err) => {
        this.joining = false;
        const toast = await this.toastCtrl.create({
          message: err.error?.error ?? 'Une erreur est survenue',
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }


  goBack() {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/tontines']);
    }
  }
  // ── Labels ────────────────────────────────────────────────────────────────

  tontineTypeLabel(type: TontineType | undefined): string {
    if (!type) return 'Inconnu';
    return this.tontineService.typeLabel(type);
  }

  frequencyLabel(frequency: Frequency): string {
    return this.tontineService.frequencyLabel(frequency);
  }

  securityLabel(model: SecurityModel): string {
    return this.tontineService.securityLabel(model);
  }

  rotationLabel(method: RotationMethod | undefined): string {
    if (!method) return 'Non défini';
    return this.tontineService.rotationLabel(method);
  }

  earlyExitLabel(mode?: string | null): string {
    if (!mode) return 'Non définie';
    return this.tontineService.earlyExitLabel(mode as any);
  }

  typeColor(type: TontineType | undefined): string {
    if (!type) return 'medium';
    const map: Record<TontineType, string> = {
      rotative: 'primary',
      crescendo: 'secondary',
      solidarity: 'success',
      savings_goal: 'tertiary',
    };
    return map[type] ?? 'medium';
  }

  formatDuration(days: number | null): string {
    if (!days) return '-';

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
}