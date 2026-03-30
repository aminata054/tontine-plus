import { Injectable, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { tap, switchMap, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { StorageService } from './storage.service';
import type { PushNotificationService } from './push-notification.service';
import {
  SendOtpResponse,
  VerifyOtpResponse,
  SetupPinResponse,
  CompleteProfileResponse,
  LoginPinResponse,
  FirebaseSignInResponse,
  UserProfile
} from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly API = environment.apiUrl + '/auth';
  private readonly FIREBASE_SIGN_IN_URL =
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${environment.firebase.apiKey}`;

  private currentUserSubject = new BehaviorSubject<UserProfile | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private storage: StorageService,
    private injector: Injector,
  ) {
    this.loadUserFromStorage();
  }

  private async getPushService(): Promise<PushNotificationService> {
    const { PushNotificationService } = await import('./push-notification.service');
    return this.injector.get<PushNotificationService>(PushNotificationService);
  }

  private async loadUserFromStorage(): Promise<void> {
    const user = await this.storage.getUser();
    if (user) this.currentUserSubject.next(user);
  }

  sendOtp(phoneNumber: string): Observable<SendOtpResponse> {
    const cleanPhone = phoneNumber.replace(/[\s\-]/g, '');
    return this.http.post<SendOtpResponse>(`${this.API}/send-otp`, {
      phoneNumber: cleanPhone
    }).pipe(
      tap(async (res) => {
        if (res.success) await this.storage.setPhoneNumber(cleanPhone);
      })
    );
  }

  verifyOtp(sessionInfo: string, code: string, phoneNumber: string): Observable<VerifyOtpResponse> {
    return this.http.post<VerifyOtpResponse>(`${this.API}/verify-otp`, {
      sessionInfo, code, phoneNumber
    }).pipe(
      switchMap(res => {
        if (res.success) {
          return from(
            Promise.all([
              this.storage.setToken(res.idToken),
              this.storage.setPhoneNumber(phoneNumber)
            ])
          ).pipe(map(() => res));
        }
        return of(res);
      })
    );
  }

  setupPin(pin: string): Observable<SetupPinResponse> {
    return this.http.post<SetupPinResponse>(`${this.API}/setup-pin`, { pin });
  }

  completeProfile(data: {
    fullName: string;
    birthDate: string;
    email?: string;
    photoUrl?: string;
    plan?: 'monthly' | 'annual' | 'premium';
  }): Observable<CompleteProfileResponse> {
    return this.http.post<CompleteProfileResponse>(`${this.API}/complete-profile`, data).pipe(
      tap(async (res) => {
        if (res.success) {
          await this.storage.setUser(res.data);
          this.currentUserSubject.next(res.data);
          this.getPushService()
            .then(svc => svc.initialize())
            .catch(err => console.error('[Push] Erreur init:', err));
        }
      })
    );
  }

  loginWithPin(phoneNumber: string, pin: string): Observable<LoginPinResponse> {
    const cleanPhone = phoneNumber.replace(/[\s\-]/g, '');
    return this.http.post<LoginPinResponse>(`${this.API}/login-pin`, {
      phoneNumber: cleanPhone, pin
    }).pipe(
      switchMap(async (res) => {
        if (res.success && res.customToken) {
          const firebaseRes = await this.exchangeCustomToken(res.customToken);
          await this.storage.setToken(firebaseRes.idToken);
          await this.storage.setUser(res.profile);
          this.currentUserSubject.next(res.profile);
          this.getPushService()
            .then(svc => svc.initialize())
            .catch(err => console.error('[Push] Erreur init:', err));
        }
        return res;
      })
    );
  }

  private exchangeCustomToken(customToken: string): Promise<FirebaseSignInResponse> {
    return this.http.post<FirebaseSignInResponse>(
      this.FIREBASE_SIGN_IN_URL,
      { token: customToken, returnSecureToken: true },
    ).toPromise() as Promise<FirebaseSignInResponse>;
  }

  async logout(): Promise<void> {
    await this.storage.clear();
    this.currentUserSubject.next(null);
    this.getPushService()
      .then(svc => svc.unregister())
      .catch(err => console.error('[Push] Erreur unregister:', err));
  }

  get currentUser(): UserProfile | null {
    return this.currentUserSubject.value;
  }

  async isLoggedIn(): Promise<boolean> {
    const token = await this.storage.getToken();
    return !!token;
  }

  async getSavedPhoneNumber(): Promise<string | null> {
    return this.storage.getPhoneNumber();
  }
}