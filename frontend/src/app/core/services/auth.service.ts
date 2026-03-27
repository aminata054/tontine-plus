import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { tap, switchMap, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { StorageService } from './storage.service';
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

  // URL de l'Identity Toolkit pour échanger un customToken contre un idToken
  private readonly FIREBASE_SIGN_IN_URL =
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${environment.firebase.apiKey}`;

  private currentUserSubject = new BehaviorSubject<UserProfile | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private storage: StorageService
  ) {
    this.loadUserFromStorage();
  }

  // ─────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────
  private async loadUserFromStorage(): Promise<void> {
    const user = await this.storage.getUser();
    if (user) this.currentUserSubject.next(user);
  }

  // ─────────────────────────────────────────
  // ÉTAPE 1A — Envoyer l'OTP
  // ─────────────────────────────────────────
  sendOtp(phoneNumber: string): Observable<SendOtpResponse> {
    const cleanPhone = phoneNumber.replace(/[\s\-]/g, '');

    return this.http.post<SendOtpResponse>(`${this.API}/send-otp`, {
      phoneNumber: cleanPhone
    }).pipe(
      tap(async (res) => {
        if (res.success) {
          await this.storage.setPhoneNumber(cleanPhone);
        }
      })
    );
  }

  // ─────────────────────────────────────────
  // ÉTAPE 1B — Vérifier l'OTP
  // ─────────────────────────────────────────
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

  // ─────────────────────────────────────────
  // ÉTAPE 2A — Créer le PIN
  // ─────────────────────────────────────────
  setupPin(pin: string): Observable<SetupPinResponse> {
    // L'interceptor injecte automatiquement le Bearer token
    return this.http.post<SetupPinResponse>(`${this.API}/setup-pin`, { pin });
  }

  // ─────────────────────────────────────────
  // ÉTAPE 2B — Compléter le profil
  // ─────────────────────────────────────────
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
        }
      })
    );
  }

  // ─────────────────────────────────────────
  // ÉTAPE 3 — Login par PIN
  //
  // Flux :
  //  1. POST /login-pin → reçoit { customToken }
  //  2. Échange customToken idToken via Identity Toolkit
  //  3. Stocke l'idToken (utilisé par l'interceptor pour les prochaines requêtes)
  // ─────────────────────────────────────────
  loginWithPin(phoneNumber: string, pin: string): Observable<LoginPinResponse> {
    const cleanPhone = phoneNumber.replace(/[\s\-]/g, '');

    return this.http.post<LoginPinResponse>(`${this.API}/login-pin`, {
      phoneNumber: cleanPhone,
      pin
    }).pipe(
      switchMap(async (res) => {
        if (res.success && res.customToken) {
          const firebaseRes = await this.exchangeCustomToken(res.customToken);
          await this.storage.setToken(firebaseRes.idToken);
          await this.storage.setUser(res.profile);
          this.currentUserSubject.next(res.profile);
        }
        return res;
      })
    );
  }

  // ─────────────────────────────────────────
  // Échange customToken idToken
  // Appel direct à l'Identity Toolkit (hors interceptor)
  // ─────────────────────────────────────────
  private exchangeCustomToken(customToken: string): Promise<FirebaseSignInResponse> {
    return this.http.post<FirebaseSignInResponse>(
      this.FIREBASE_SIGN_IN_URL,
      { token: customToken, returnSecureToken: true },
    ).toPromise() as Promise<FirebaseSignInResponse>;
  }

  // ─────────────────────────────────────────
  // Déconnexion
  // ─────────────────────────────────────────
  async logout(): Promise<void> {
    await this.storage.clear();
    this.currentUserSubject.next(null);
  }

  // ─────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────
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