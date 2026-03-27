import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonIcon } from '@ionic/angular/standalone';
import { CustomButtonComponent } from "../shared/ui/custom-button/custom-button.component";
import { CustomInputComponent } from "../shared/ui/custom-input/custom-input.component";
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../shared/ui/page-header/page-header.component';
import { StepIndicatorComponent } from '../shared/ui/step-indicator/step-indicator.component';
import { SelectionCardComponent } from '../shared/ui/selection-card/selection-card.component';
import { OtpInputComponent } from '../shared/ui/otp-input/otp-input.component';
import { StateScreenComponent } from '../shared/ui/state-screen/state-screen.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [StepIndicatorComponent, OtpInputComponent, SelectionCardComponent, StateScreenComponent,IonContent, CustomButtonComponent, CustomInputComponent, FormsModule, PageHeaderComponent],
})
export class HomePage {
  otpCode: string = '';
  timer: number = 45;   // Timer pour renvoyer le code
  constructor() { 
    this.startTimer();
  }

  onOtpCompleted(code: string) {
    console.log('OTP complet :', code);
    // Tu peux appeler verifyOtp() automatiquement ici si tu veux
  }

  verifyOtp() {
    if (this.otpCode.length === 6) {
      console.log('Vérification OTP :', this.otpCode);
      // Appel API ici
    }
  }

  resendOtp() {
    if (this.timer === 0) {
      console.log('Code renvoyé');
      this.timer = 45;
      this.startTimer();
      // Logique de renvoi SMS
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
