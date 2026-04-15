import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, timer } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
    InitiatePaymentPayload,
    InitiatePaymentResponse,
    VerifyPaymentPayload,
    VerifyPaymentResponse,
    ReceiptResponse,
    PaymentsListResponse,
    Payment,
    PaymentMethod,
    PAYMENT_METHODS,
    PaymentMethodConfig,
} from '../models/payment.model';

@Injectable({ providedIn: 'root' })
export class PaymentService {

    private readonly API = environment.apiUrl + '/payments';

    constructor(private http: HttpClient) { }

    // ── INITIER UN PAIEMENT ────────────────────────────────────────────────────

    /**
     * Lance un paiement de cotisation.
     * Retourne le paymentId et le délai de simulation.
     * En mode simulation, appelez ensuite verifyAfterDelay() ou verify().
     */
    initiate(payload: InitiatePaymentPayload): Observable<InitiatePaymentResponse> {
        return this.http.post<InitiatePaymentResponse>(`${this.API}/initiate`, payload);
    }

    // ── VÉRIFIER UN PAIEMENT ───────────────────────────────────────────────────

    /**
     * Vérifie le statut d'un paiement et le confirme ou l'échoue.
     */
    verify(payload: VerifyPaymentPayload): Observable<VerifyPaymentResponse> {
        return this.http.post<VerifyPaymentResponse>(`${this.API}/verify`, payload);
    }

    /**
     * Méthode de simulation complète :
     * 1. Initie le paiement
     * 2. Attend le délai spécifique à la méthode
     * 3. Appelle verify automatiquement
     *
     * Parfait pour le flow de paiement complet côté front.
     */
    initiateAndSimulate(payload: InitiatePaymentPayload): Observable<VerifyPaymentResponse> {
        return this.initiate(payload).pipe(
            switchMap((initRes) => {
                if (!initRes.success)
                    throw new Error(initRes.message);

                const delayMs = initRes.data.simulationDelayMs ?? 3000;
                const paymentId = initRes.data.paymentId;

                // Attendre le délai de simulation puis vérifier
                return timer(delayMs).pipe(
                    switchMap(() => this.verify({ paymentId }))
                );
            })
        );
    }

    // ── REÇU ───────────────────────────────────────────────────────────────────

    getReceipt(paymentId: string): Observable<ReceiptResponse> {
        return this.http.get<ReceiptResponse>(`${this.API}/${paymentId}/receipt`);
    }

    // ── HISTORIQUE ─────────────────────────────────────────────────────────────

    getMyPayments(tontineId?: string): Observable<PaymentsListResponse> {
        let params = new HttpParams();
        if (tontineId) params = params.set('tontineId', tontineId);
        return this.http.get<PaymentsListResponse>(this.API, { params });
    }

    // ── VÉRIFICATION MANUELLE (créateur/admin) ─────────────────────────────────

    manualVerify(
        paymentId: string,
        action: 'verify' | 'reject',
        reason?: string
    ): Observable<any> {
        return this.http.patch<any>(`${this.API}/${paymentId}/manual-verify`, {
            action,
            reason,
        });
    }

    // ── UTILITAIRES ────────────────────────────────────────────────────────────

    getMethodConfig(method: PaymentMethod): PaymentMethodConfig | undefined {
        return PAYMENT_METHODS.find(m => m.id === method);
    }

    /** Liste complète des méthodes disponibles */
    getAllMethods(): PaymentMethodConfig[] {
        return PAYMENT_METHODS;
    }

    statusLabel(status: string): string {
        const map: Record<string, string> = {
            pending: 'En attente',
            confirmed: 'Confirmé',
            failed: 'Échoué',
            refunded: 'Remboursé',
        };
        return map[status] ?? status;
    }

    statusColor(status: string): string {
        const map: Record<string, string> = {
            pending: 'warning',
            confirmed: 'success',
            failed: 'danger',
            refunded: 'medium',
        };
        return map[status] ?? 'medium';
    }

    methodLabel(method: PaymentMethod): string {
        return this.getMethodConfig(method)?.label ?? method;
    }

    /**
     * Formate un montant en FCFA avec séparateur de milliers.
     */
    formatAmount(amount: number): string {
        return new Intl.NumberFormat('fr-FR').format(amount ?? 0);
    }
}