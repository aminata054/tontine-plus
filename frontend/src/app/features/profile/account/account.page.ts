import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef } from '@angular/core';
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
import { ImageUploadService } from 'src/app/core/services/image-upload.service';

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
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  constructor(
    private auth: AuthService,
    private router: Router,
    private imageUploadService: ImageUploadService,
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

  onAvatarClick(): void {
    if (this.isUploading) return;
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.isUploading = true;
    this.errorMessage = '';

    this.imageUploadService.compressAndConvert(file).subscribe({
      next: (base64) => {
        this.photoPreview = base64;
        this.photoUrl = base64;
        this.isUploading = false;
      },
      error: () => {
        this.isUploading = false;
        this.errorMessage = "Erreur lors du traitement de l'image";
      }
    });

    input.value = '';
  }


  async save(): Promise<void> {
    if (!this.fullName.trim()) return;
    this.isLoading = true;

    const loading = await this.loadingCtrl.create({ message: 'Enregistrement…', spinner: 'crescent' });
    await loading.present();

    this.auth.updateProfile({
      fullName: this.fullName.trim(),
      email: this.email.trim() || undefined,
      photoUrl: this.photoUrl || undefined,
    }).subscribe({
      next: async (res) => {
        this.isLoading = false;
        await loading.dismiss();
        if (res.success) {
          if (this.photoUrl) {
            this.photoPreview = this.photoUrl;
            if (this.user) {
              this.user = { ...this.user, photoUrl: this.photoUrl, fullName: this.fullName };
            }
          }
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