import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomInputComponent } from 'src/app/shared/ui/custom-input/custom-input.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { AuthService } from 'src/app/core/services/auth.service';


@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    IonContent,
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    CustomInputComponent,
    CustomButtonComponent
  ],
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss']
})
export class RegisterPage implements OnInit {
  phoneNumber: string = '';
  isPhoneValid: boolean = false;

  constructor(private router: Router, private auth: AuthService, private route: ActivatedRoute) { }

  ngOnInit(): void {
    const ref = this.route.snapshot.queryParamMap.get('ref');
    if (ref) {
      sessionStorage.setItem('pendingReferralCode', ref.toUpperCase().trim());
    }
  }

  onPhoneChange() {
    let raw = this.phoneNumber || '';

    let value = raw.replace(/[^0-9+]/g, '');

    if (value.startsWith('221')) {
      value = '+' + value;
    } else if (!value.startsWith('+221') && value.startsWith('+')) {
      value = '+221' + value.substring(1);
    } else if (!value.startsWith('+')) {
      value = '+221' + value;
    }

    if (value.length > 13) {
      value = value.substring(0, 13);
    }

    // formatage
    let formatted = value;
    if (value.length > 4) formatted = value.slice(0, 4) + ' ' + value.slice(4);
    if (value.length > 6) formatted = formatted.slice(0, 7) + ' ' + formatted.slice(7);
    if (value.length > 9) formatted = formatted.slice(0, 11) + ' ' + formatted.slice(11);
    if (value.length > 11) formatted = formatted.slice(0, 14) + ' ' + formatted.slice(14);

    this.phoneNumber = formatted;

    const cleaned = formatted.replace(/\s+/g, '');
    this.isPhoneValid = cleaned.length === 13 && cleaned.startsWith('+221');
  }

  goToOtp() {
    if (!this.isPhoneValid) return;
    this.auth.sendOtp(this.phoneNumber).subscribe({
      next: (res) => {
        if (res.success) {
          this.router.navigate(['/otp-page'], {
            state: { phoneNumber: this.phoneNumber, sessionInfo: res.sessionInfo }
          });
        }
      },
      error: (err) => console.error(err)
    });
  }
}