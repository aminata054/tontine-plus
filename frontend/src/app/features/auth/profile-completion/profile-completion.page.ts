import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, IonSpinner, ToastController } from '@ionic/angular/standalone';

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { getStorage, ref, uploadString, getDownloadURL } from '@angular/fire/storage';
import { inject } from '@angular/core';
import { Storage } from '@angular/fire/storage';
import { Router } from '@angular/router';

import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomInputComponent } from 'src/app/shared/ui/custom-input/custom-input.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { AuthService } from 'src/app/core/services/auth.service';
import { UserProfile } from 'src/app/core/models/auth.model';
import { SubscriptionService } from 'src/app/core/services/subscription.service';
import { ImageUploadService } from 'src/app/core/services/image-upload.service';

@Component({
  selector: 'app-profile-completion',
  standalone: true,
  imports: [IonIcon,
    IonContent,
    IonSpinner,
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    CustomInputComponent,
    CustomButtonComponent
  ],
  templateUrl: './profile-completion.page.html',
  styleUrls: ['./profile-completion.page.scss']
})
export class ProfileCompletionPage {

  profile: UserProfile | null = null;
  fullName: string = '';
  email: string = '';
  birthDate: string = '';
  photoPreview: string = '';
  photoUrl: string = '';
  isUploading: boolean = false;
  errorMessage: string = '';
  status: 'input' | 'success' | 'error' = 'input';
  isSubmitting = false;

  private fireStorage = inject(Storage);
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  constructor(private router: Router,
    private auth: AuthService,
    private subscriptionService: SubscriptionService,
    private imageUploadService: ImageUploadService,
    private toastCtrl: ToastController
  ) { }

  private async applyPendingReferral(): Promise<void> {
    const code = sessionStorage.getItem('pendingReferralCode');
    if (!code) return;

    try {
      const res = await this.subscriptionService.applyReferral(code).toPromise();
      if (res?.success) {
        sessionStorage.removeItem('pendingReferralCode');
        const toast = await this.toastCtrl.create({
          message: '🎁 15 jours offerts grâce au parrainage !',
          duration: 4000,
          color: 'success',
          position: 'top',
        });
        await toast.present();
      }
    } catch {
      // Code invalide ou déjà utilisé → on nettoie silencieusement
      // L'inscription reste valide dans tous les cas
      sessionStorage.removeItem('pendingReferralCode');
    }
  }

  get isFormValid(): boolean {
    return this.fullName.trim().length > 1 &&
      this.birthDate.length > 0 &&
      !this.isUploading;
  }

  onAvatarClick(): void {
    if (this.isUploading) return;
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.errorMessage = 'Veuillez choisir une image';
      return;
    }

    this.isUploading = true;
    this.errorMessage = '';

    this.imageUploadService.compressAndConvert(file).subscribe({
      next: (base64) => {
        this.photoPreview = base64;
        this.photoUrl = base64; // envoyé au backend
        this.isUploading = false;
      },
      error: () => {
        this.isUploading = false;
        this.errorMessage = "Erreur lors du traitement de l'image";
      }
    });

    input.value = '';
  }

  async completeProfile(): Promise<void> {
    if (!this.isFormValid || this.isSubmitting) return;

    this.isSubmitting = true;
    this.errorMessage = '';

    this.auth.completeProfile({
      fullName: this.fullName,
      birthDate: this.birthDate,
      email: this.email || undefined,
      photoUrl: this.photoUrl || undefined,
    }).subscribe({
      next: async (res) => {
        if (res.success) {
          await this.applyPendingReferral();
          this.router.navigate(['/dashboard']);
        } else {
          this.isSubmitting = false;
          await this.showToast(res.message ?? 'Une erreur est survenue. Réessayez.');
        }
      },
      error: async (err: any) => {
        this.isSubmitting = false;
        const message = err?.error?.error ?? 'Une erreur est survenue. Réessayez.';
        await this.showToast(message);
      }
    });
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color: 'danger',
      icon: 'alert-circle-outline',
    });
    await toast.present();
  }
}