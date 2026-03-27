import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { OtpInputComponent } from 'src/app/shared/ui/otp-input/otp-input.component';
import { AuthService } from 'src/app/core/services/auth.service';
import { StorageService } from 'src/app/core/services/storage.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    IonContent,
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    CustomButtonComponent,
    OtpInputComponent,
  ],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {

  pinCode: string = '';
  phoneNumber: string = '';
  isLoading: boolean = false;
  errorMessage: string = '';

  constructor(
    private auth: AuthService,
    private storage: StorageService,
    private router: Router,
  ) { }

  async ngOnInit(): Promise<void> {
    // Récupérer le numéro mémorisé lors du send-otp / verify-otp
    const saved = await this.storage.getPhoneNumber();
    if (saved) {
      this.phoneNumber = saved;
    } else {
      // Pas de numéro sauvegardé on retourne à l'écran d'inscription
      this.router.navigate(['/register'], { replaceUrl: true });
    }
  }

  onPinCompleted(code: string): void {
    this.pinCode = code;
    // Auto-submit dès que les 4 chiffres sont saisis
    this.verifyPin();
  }

  verifyPin(): void {
    if (this.pinCode.length !== 4 || this.isLoading) return;

    const cleanPhone = this.phoneNumber.replace(/\s+/g, '')

    this.isLoading = true;
    this.errorMessage = '';

    this.auth.loginWithPin(cleanPhone, this.pinCode).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.success) {
          this.router.navigate(['/home'], { replaceUrl: true });
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.pinCode = '';

        const status = err?.status;
        if (status === 401) {
          this.errorMessage = 'Code PIN incorrect. Réessayez.';
        } else if (status === 404) {
          this.errorMessage = 'Aucun compte trouvé pour ce numéro.';
        } else {
          this.errorMessage = 'Une erreur est survenue. Réessayez.';
        }
      }
    });
  }

  forgotPin(): void {
    this.router.navigate(['/forgot-pin']);
  }
}