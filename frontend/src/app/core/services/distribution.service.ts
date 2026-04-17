import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
    TriggerDistributionPayload,
    TriggerDistributionResponse,
    ConfirmDistributionPayload,
    ConfirmDistributionResponse,
    TurnCollectionStatusResponse,
    DistributionListResponse,
    DistributionMethod,
    DistributionStatus,
    DISTRIBUTION_METHODS,
    DistributionMethodConfig,
} from '../models/distribution.model';

@Injectable({ providedIn: 'root' })
export class DistributionService {

    private readonly API = environment.apiUrl + '/distributions';

    constructor(private http: HttpClient) { }

    // ── ÉTAT DE COLLECTE ───────────────────────────────────────────────────────

    getTurnStatus(tontineId: string, turnNumber?: number): Observable<TurnCollectionStatusResponse> {
        let params = new HttpParams().set('tontineId', tontineId);
        if (turnNumber !== undefined) params = params.set('turnNumber', turnNumber.toString());
        return this.http.get<TurnCollectionStatusResponse>(`${this.API}/turn-status`, { params });
    }

    // ── DÉCLENCHER LA DISTRIBUTION ─────────────────────────────────────────────

    trigger(payload: TriggerDistributionPayload): Observable<TriggerDistributionResponse> {
        return this.http.post<TriggerDistributionResponse>(`${this.API}/trigger`, payload);
    }

    // ── CONFIRMER LA RÉCEPTION ─────────────────────────────────────────────────

    confirm(payload: ConfirmDistributionPayload): Observable<ConfirmDistributionResponse> {
        return this.http.post<ConfirmDistributionResponse>(`${this.API}/confirm`, payload);
    }

    /**
     * Flow de simulation complet :
     * 1. Déclenche la distribution
     * 2. Attend le délai de simulation
     * 3. Confirme automatiquement la réception
     */
    triggerAndSimulate(payload: TriggerDistributionPayload): Observable<ConfirmDistributionResponse> {
        return this.trigger(payload).pipe(
            switchMap((triggerRes) => {
                if (!triggerRes.success) throw new Error(triggerRes.message);

                const delay = triggerRes.data.simulationDelayMs ?? 4000;
                const distributionId = triggerRes.data.distributionId;

                return timer(delay).pipe(
                    switchMap(() => this.confirm({
                        distributionId,
                        tontineId: payload.tontineId,
                    }))
                );
            })
        );
    }

    // ── HISTORIQUE ─────────────────────────────────────────────────────────────

    getByTontine(tontineId: string): Observable<DistributionListResponse> {
        const params = new HttpParams().set('tontineId', tontineId);
        return this.http.get<DistributionListResponse>(this.API, { params });
    }

    getOne(distributionId: string, tontineId: string): Observable<any> {
        const params = new HttpParams().set('tontineId', tontineId);
        return this.http.get<any>(`${this.API}/${distributionId}`, { params });
    }

    // ── UTILITAIRES ────────────────────────────────────────────────────────────

    getMethodConfig(method: DistributionMethod): DistributionMethodConfig | undefined {
        return DISTRIBUTION_METHODS.find(m => m.id === method);
    }

    getAllMethods(): DistributionMethodConfig[] {
        return DISTRIBUTION_METHODS;
    }

    statusLabel(status: DistributionStatus): string {
        const map: Record<DistributionStatus, string> = {
            pending: 'En attente',
            sent: 'Envoyé',
            received: 'Reçu',
            partial: 'Partiel',
        };
        return map[status] ?? status;
    }

    statusColor(status: DistributionStatus): string {
        const map: Record<DistributionStatus, string> = {
            pending: 'warning',
            sent: 'primary',
            received: 'success',
            partial: 'medium',
        };
        return map[status] ?? 'medium';
    }

    statusIcon(status: DistributionStatus): string {
        const map: Record<DistributionStatus, string> = {
            pending: 'time-outline',
            sent: 'paper-plane-outline',
            received: 'checkmark-circle-outline',
            partial: 'alert-circle-outline',
        };
        return map[status] ?? 'ellipse-outline';
    }

    formatAmount(amount: number): string {
        return new Intl.NumberFormat('fr-FR').format(amount ?? 0);
    }

    /** Calcule le pourcentage de collecte pour la barre de progression */
    collectionPercent(paidCount: number, totalMembers: number): number {
        if (totalMembers === 0) return 0;
        return Math.min(100, Math.round((paidCount / totalMembers) * 100));
    }
}