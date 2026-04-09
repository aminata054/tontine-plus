import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, take, switchMap, takeUntil } from 'rxjs/operators';
import { IonContent, IonIcon, ToastController, LoadingController } from '@ionic/angular/standalone';
import { Storage } from '@angular/fire/storage';

import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomInputComponent } from 'src/app/shared/ui/custom-input/custom-input.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { AuthService } from 'src/app/core/services/auth.service';
import { UserProfile } from 'src/app/core/models/auth.model';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonIcon,
    PageHeaderComponent,
    CustomInputComponent,
    CustomButtonComponent,
  ],
  templateUrl: './account.page.html',
  styleUrls: ['./account.page.scss'],
})
export class AccountPage implements OnInit, OnDestroy {

  user: UserProfile | null = null;
  fullName = '';
  email = '';
  photoPreview = '';
  photoUrl: string = '';
  isLoading = false;
  isUploading: boolean = false;
  errorMessage: string = '';

  private fireStorage = inject(Storage);
  private destroy$ = new Subject<void>();

  constructor(
    private auth: AuthService,
    private router: Router,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
  ) { }

  ngOnInit(): void {
    this.auth.isLoaded$.pipe(
      filter(loaded => loaded),
      take(1),
      switchMap(() => this.auth.currentUser$),
      takeUntil(this.destroy$),
    ).subscribe(user => {
      if (!user) { this.router.navigate(['/auth/login'], { replaceUrl: true }); return; }
      this.user = user;
      this.fullName = user.fullName;
      this.email = user.email ?? '';
      this.photoPreview = user.photoUrl ?? '';
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async pickPhoto(): Promise<void> {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: true,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
        width: 400,
        height: 400,
      });

      if (!photo.base64String) return;

      // Afficher la preview 
      this.photoPreview = `data:image/${photo.format};base64,${photo.base64String}`;
      this.isUploading = true;
      this.errorMessage = '';

      this.photoUrl = await this.uploadToFirebase(
        photo.base64String,
        photo.format ?? 'jpeg'
      );

    } catch (err: any) {
      if (err?.message?.includes('cancelled') || err?.message?.includes('canceled')) return;
      this.errorMessage = "Impossible de charger la photo. Réessayez.";
    } finally {
      this.isUploading = false;
    }
  }

  private async uploadToFirebase(base64: string, format: string): Promise<string> {
    const uid = this.auth.currentUser?.uid ?? Date.now().toString();
    const path = `avatars/${uid}/profile.${format}`;

    const storageRef = ref(this.fireStorage, path);

    await uploadString(storageRef, base64, 'base64', {
      contentType: `image/${format}`
    });

    return await getDownloadURL(storageRef);
  }

  async save(): Promise<void> {
    if (!this.fullName.trim()) return;
    this.isLoading = true;

    const loading = await this.loadingCtrl.create({ message: 'Enregistrement…', spinner: 'crescent' });
    await loading.present();

    this.auth.updateProfile({
      fullName: this.fullName.trim(),
      email: this.email.trim() || undefined,
      photoUrl: this.photoPreview || undefined,
    }).subscribe({
      next: async (res) => {
        this.isLoading = false;
        await loading.dismiss();
        if (res.success) {
          await this.showToast('Profil mis à jour.', 'success');
          this.router.navigate(['/profile']);
        }
      },
      error: async () => {
        this.isLoading = false;
        await loading.dismiss();
        await this.showToast('Erreur lors de la mise à jour.', 'danger');
      },
    });
  }

  getInitials(): string {
    if (!this.user?.fullName) return '?';
    return this.user.fullName
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

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