import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { PageHeaderComponent } from "src/app/shared/ui/page-header/page-header.component";
import { CustomButtonComponent } from "src/app/shared/ui/custom-button/custom-button.component";
import { OtpInputComponent } from 'src/app/shared/ui/otp-input/otp-input.component';
import { StateScreenComponent } from 'src/app/shared/ui/state-screen/state-screen.component';
import { AuthService } from 'src/app/core/services/auth.service';

@Component({
  selector: 'app-pin-setup',
  templateUrl: './pin-setup.page.html',
  styleUrls: ['./pin-setup.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    CustomButtonComponent,
    OtpInputComponent,
    StateScreenComponent
  ]
})
export class PinSetupPage {

  pinCode: string = '';
  status: 'input' | 'success' | 'error' = 'input';   // Gestion des états

  constructor(private router: Router, private auth: AuthService) { }

  onPinCompleted(code: string) {
    this.pinCode = code;
  }

  async createPin() {
    if (this.pinCode.length !== 4) return;

    this.auth.setupPin(this.pinCode).subscribe({
      next: (res) => {
        if (res.success) {
          this.status = 'success';
        } else {
          this.status = 'error';
        }
      },
      error: () => this.status = 'error'
    });
  }

  // Réessayer en cas d'erreur
  retry() {
    this.pinCode = '';
    this.status = 'input';
  }

  goToNext() {
    this.router.navigate(['/profile-completion']);
  }

}