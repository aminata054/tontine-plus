import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, ToastController } from '@ionic/angular/standalone';

import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { AuthService } from 'src/app/core/services/auth.service';
import { OtpInputComponent } from 'src/app/shared/ui/otp-input/otp-input.component';

type Step = 'current' | 'new' | 'confirm';

@Component({
  selector: 'app-change-pin',
  standalone: true,
  imports: [CommonModule, IonContent, PageHeaderComponent, OtpInputComponent],
  templateUrl: './change-pin.page.html',
  styleUrls: ['./change-pin.page.scss'],
})
export class ChangePinPage {

  @ViewChild(OtpInputComponent) otpInput!: OtpInputComponent;

  step: Step = 'current';
  currentPin = '';
  newPin = '';
  confirmPin = '';
  isLoading = false;
  errorMessage = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private toastCtrl: ToastController,
  ) { }

  get title(): string {
    return 'Modifier mon code secret';
  }

  get subtitle(): string {
    const map: Record<Step, string> = {
      current: 'Saisir votre ancien code secret',
      new: 'Saisir le nouveau code secret',
      confirm: 'Confirmer le nouveau code secret',
    };
    return map[this.step];
  }

  onPinCompleted(pin: string): void {
    this.errorMessage = '';

    if (this.step === 'current') {
      this.currentPin = pin;
      this.verifyCurrentPin();
    } else if (this.step === 'new') {
      this.newPin = pin;
      this.step = 'confirm';
      this.resetOtp();
    } else {
      this.confirmPin = pin;
      this.submitNewPin();
    }
  }

  private resetOtp(): void {
    // Vider et redonner le focus au composant OTP pour l'étape suivante
    setTimeout(() => {
      this.otpInput.writeValue('');
      const firstInput = this.otpInput.inputs.get(0);
      firstInput?.nativeElement.focus();
    }, 150);
  }

  private verifyCurrentPin(): void {
    this.isLoading = true;
    const phone = this.auth.currentUser?.phoneNumber ?? '';

    this.auth.loginWithPin(phone, this.currentPin).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.success) {
          this.step = 'new';
          this.resetOtp();
        } else {
          this.errorMessage = 'Code PIN incorrect.';
          this.currentPin = '';
          this.resetOtp();
        }
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'Code PIN incorrect.';
        this.currentPin = '';
        this.resetOtp();
      },
    });
  }

  private submitNewPin(): void {
    if (this.newPin !== this.confirmPin) {
      this.errorMessage = 'Les codes ne correspondent pas.';
      this.confirmPin = '';
      this.step = 'new';
      this.resetOtp();
      return;
    }

    this.isLoading = true;
    this.auth.changePin(this.currentPin, this.newPin).subscribe({
      next: async (res) => {
        this.isLoading = false;
        if (res.success) {
          const toast = await this.toastCtrl.create({
            message: 'Code secret modifié avec succès.',
            duration: 2500,
            color: 'success',
            position: 'top',
          });
          await toast.present();
          this.router.navigate(['/profile'], { replaceUrl: true });
        }
      },
      error: async () => {
        this.isLoading = false;
        this.errorMessage = 'Erreur. Réessayez.';
        this.confirmPin = '';
        this.newPin = '';
        this.step = 'new';
        this.resetOtp();
      },
    });
  }
}