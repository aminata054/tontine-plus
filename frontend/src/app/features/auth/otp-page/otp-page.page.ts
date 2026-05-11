import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { OtpInputComponent } from 'src/app/shared/ui/otp-input/otp-input.component';
import { StateScreenComponent } from 'src/app/shared/ui/state-screen/state-screen.component';
import { AuthService } from 'src/app/core/services/auth.service';
import { StorageService } from 'src/app/core/services/storage.service';

type PageStatus = 'input' | 'success' | 'error';

@Component({
  selector: 'app-otp-page',
  standalone: true,
  imports: [
    IonContent,
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    CustomButtonComponent,
    OtpInputComponent,
    StateScreenComponent
  ],
  templateUrl: './otp-page.page.html',
  styleUrls: ['./otp-page.page.scss']
})
export class OtpPagePage implements OnInit {

  otpCode: string = '';
  phoneNumber: string = '';
  sessionInfo: string = '';
  timer: number = 45;
  status: PageStatus = 'input';

  constructor(private router: Router, private auth: AuthService, private storage: StorageService,) { }

  ngOnInit() {
    const state = history.state;
    if (state?.phoneNumber) this.phoneNumber = state.phoneNumber;
    if (state?.sessionInfo) this.sessionInfo = state.sessionInfo;
    this.startTimer();
  }

  // Appelé quand l'utilisateur complète les 6 chiffres
  onOtpCompleted(code: string) {
    this.otpCode = code;
    this.verifyOtp();
  }

  async verifyOtp() {
    if (this.otpCode.length !== 6) return;

    this.auth.verifyOtp(this.sessionInfo, this.otpCode, this.phoneNumber).subscribe({
      next: async (res) => {
        if (res.success) {
          // Si l'utilisateur est déjà complet, on charge son profil depuis l'API
          // pour alimenter currentUser$ avant la navigation
          if (res.pinSet && res.profileComplete) {
            // Le token est déjà sauvegardé par verifyOtp() dans AuthService
            // On force le rechargement du profil via l'API ici
            // (ou on attend simplement que loginWithPin le fasse côté login)
            // Pour l'inscription, on marque juste le state
          }

          this.status = 'success';
          history.replaceState({
            ...history.state,
            isNewUser: res.isNewUser,
            pinSet: res.pinSet,
            profileComplete: res.profileComplete
          }, '');
        } else {
          this.status = 'error';
        }
      },
      error: () => this.status = 'error'
    });
  }

  retryOtp() {
    this.otpCode = '';
    this.status = 'input';
  }

  goToNextStep() {
    const state = history.state;
    if (!state.pinSet) {
      this.router.navigate(['/pin-setup']);
    } else if (!state.profileComplete) {
      this.router.navigate(['/profile-completion']);
    } else {
      this.router.navigate(['/login']);
    }
  }

  goBack() {
    this.router.navigate(['/register']);
  }

  resendOtp() {
    if (this.timer === 0) {
      this.auth.sendOtp(this.phoneNumber).subscribe({
        next: (res) => {
          if (res.success) {
            this.sessionInfo = res.sessionInfo;
            this.timer = 45;
            this.otpCode = '';
            this.status = 'input';
            this.startTimer();
          }
        }
      });
    }
  }

  private startTimer() {
    const interval = setInterval(() => {
      if (this.timer > 0) {
        this.timer--;
      } else {
        clearInterval(interval);
      }
    }, 1000);
  }


}