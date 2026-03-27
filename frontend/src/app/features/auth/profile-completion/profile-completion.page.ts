import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';

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

  private fireStorage = inject(Storage);

  constructor(private router: Router, private auth: AuthService) { }

  get isFormValid(): boolean {
    return this.fullName.trim().length > 1 &&
      this.birthDate.length > 0 &&
      !this.isUploading;
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

  completeProfile() {
    if (!this.isFormValid) return;

    this.errorMessage = '';
    this.auth.completeProfile({
      fullName: this.fullName,
      birthDate: this.birthDate,
      email: this.email || undefined,
      photoUrl: this.photoUrl || undefined, 
    }).subscribe({
      next: (res) => {
        if (res.success) {
          this.router.navigate(['/home']);
        }
         error: (err: any) => {

          this.errorMessage =
            err?.error?.error || 'Une erreur est survenue. Réessayez.';
        }
      }
    });
  }
}