import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

import {
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    AccessCheckResponse,
    ActivateSubscriptionPayload,
    ActivateSubscriptionResponse,
    ChangePlanPayload,
    CancelSubscriptionPayload,
    ApplyReferralPayload,
    PlansResponse,
    SubscriptionResponse,
    SubscriptionHistoryResponse,
} from '../models/subscription.model';

@Injectable({ providedIn: 'root' })
export class SubscriptionService {

    private readonly API = environment.apiUrl + '/subscriptions';

    /** Cache réactif de l'abonnement courant */
    private subscriptionSubject = new BehaviorSubject<Subscription | null>(null);
    public subscription$ = this.subscriptionSubject.asObservable();

    /** Cache réactif de l'accès */
    private hasAccessSubject = new BehaviorSubject<boolean>(false);
    public hasAccess$ = this.hasAccessSubject.asObservable();

    constructor(private http: HttpClient) { }

    // ── Lecture ───────────────────────────────────────────────────────────────

    simulateSubscription(plan: 'monthly' | 'annual' | 'premium' = 'premium') {
        return this.http.post(`${this.API}/simulate`, { plan });
    }

    get currentHasAccess(): boolean {
        return this.hasAccessSubject.getValue();
    }

    getAvailablePlans(): Observable<PlansResponse> {
        return this.http.get<PlansResponse>(`${this.API}/plans`);
    }

    getMySubscription(): Observable<SubscriptionResponse> {
        return this.http.get<SubscriptionResponse>(`${this.API}/me`).pipe(
            tap((res) => {
                if (res.success) {
                    this.subscriptionSubject.next(res.data);
                    this.hasAccessSubject.next(res.data.hasAccess ?? false);
                }
            })
        );
    }

    getSubscriptionHistory(): Observable<SubscriptionHistoryResponse> {
        return this.http.get<SubscriptionHistoryResponse>(`${this.API}/history`);
    }

    checkAccess(): Observable<AccessCheckResponse> {
        return this.http.get<AccessCheckResponse>(`${this.API}/access`).pipe(
            tap((res) => {
                if (res.success) {
                    this.hasAccessSubject.next(res.data.hasAccess);
                }
            })
        );
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    /**
     * Activer un abonnement après paiement mobile money.
     * @param plan          Plan choisi
     * @param transactionId Référence de la transaction (Orange Money, Wave…)
     * @param receiptUrl    Lien vers le reçu (optionnel)
     */
    activateSubscription(
        plan: SubscriptionPlan,
        transactionId: string,
        receiptUrl?: string
    ): Observable<ActivateSubscriptionResponse> {
        const payload: ActivateSubscriptionPayload = { plan, transactionId, receiptUrl };
        return this.http
            .post<ActivateSubscriptionResponse>(`${this.API}/activate`, payload)
            .pipe(
                tap((res) => {
                    if (res.success) {
                        // Rafraîchir le cache
                        this.getMySubscription().subscribe();
                    }
                })
            );
    }

    changePlan(newPlan: SubscriptionPlan): Observable<any> {
        const payload: ChangePlanPayload = { newPlan };
        return this.http.post<any>(`${this.API}/change-plan`, payload).pipe(
            tap((res) => { if (res.success) this.getMySubscription().subscribe(); })
        );
    }

    /**
     * Annuler l'abonnement.
     * @param immediately true = révocation immédiate, false = à la fin de la période
     * @param reason      Raison optionnelle (feedback)
     */
    cancelSubscription(
        immediately = false,
        reason?: string
    ): Observable<any> {
        const payload: CancelSubscriptionPayload = { immediately, reason };
        return this.http.post<any>(`${this.API}/cancel`, payload).pipe(
            tap((res) => { if (res.success) this.getMySubscription().subscribe(); })
        );
    }

    reactivateSubscription(): Observable<any> {
        return this.http.post<any>(`${this.API}/reactivate`, {}).pipe(
            tap((res) => { if (res.success) this.getMySubscription().subscribe(); })
        );
    }

    applyReferral(referralCode: string): Observable<any> {
        const payload: ApplyReferralPayload = { referralCode };
        return this.http.post<any>(`${this.API}/referral`, payload).pipe(
            tap((res) => { if (res.success) this.getMySubscription().subscribe(); })
        );
    }

    // ── Labels / helpers ──────────────────────────────────────────────────────

    planLabel(plan: SubscriptionPlan): string {
        const map: Record<SubscriptionPlan, string> = {
            monthly: 'Mensuel',
            annual: 'Annuel',
            premium: 'Premium',
        };
        return map[plan] ?? plan;
    }

    statusLabel(status: SubscriptionStatus): string {
        const map: Record<SubscriptionStatus, string> = {
            trialing: 'Période d\'essai',
            active: 'Actif',
            past_due: 'Paiement en retard',
            canceled: 'Annulé',
            expired: 'Expiré',
        };
        return map[status] ?? status;
    }

    statusColor(status: SubscriptionStatus): string {
        const map: Record<SubscriptionStatus, string> = {
            trialing: 'warning',
            active: 'success',
            past_due: 'danger',
            canceled: 'medium',
            expired: 'danger',
        };
        return map[status] ?? 'medium';
    }

    planAmount(plan: SubscriptionPlan): number {
        const map: Record<SubscriptionPlan, number> = {
            monthly: 2000,
            annual: 20000,
            premium: 5000,
        };
        return map[plan];
    }

    /** Vider le cache (ex: au logout) */
    clearCache(): void {
        this.subscriptionSubject.next(null);
        this.hasAccessSubject.next(false);
    }
}