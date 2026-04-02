import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
    CreateTontinePayload,
    CreateTontineResponse,
    EarlyExitMode,
    EarlyExitPenalty,
    Frequency,
    RotationMethod,
    SecurityModel,
    Tontine,
    TontineDetailResponse,
    TontineInviteResponse,
    TontineListResponse,
    TontineStatus,
    TontineType,
    TontineVisibility,
} from '../models/tontine.model';

@Injectable({ providedIn: 'root' })
export class TontineService {

    private readonly API = environment.apiUrl + '/tontines';

    /** Cache local de la liste des tontines de l'utilisateur */
    private tontinesSubject = new BehaviorSubject<Tontine[]>([]);
    public tontines$ = this.tontinesSubject.asObservable();

    constructor(private http: HttpClient) { }

    // ── CRÉER ──────────────────────────────────────────────────────────────────
    createTontine(payload: CreateTontinePayload): Observable<CreateTontineResponse> {
        return this.http.post<CreateTontineResponse>(this.API, payload);
    }

    // ── MES TONTINES ───────────────────────────────────────────────────────────
    getMyTontines(status?: TontineStatus): Observable<TontineListResponse> {
        let params = new HttpParams();
        if (status) params = params.set('status', status);

        return this.http.get<TontineListResponse>(this.API, { params }).pipe(
            tap(res => {
                if (res.success) this.tontinesSubject.next(res.data);
            })
        );
    }

    // ── DÉTAILS ────────────────────────────────────────────────────────────────
    getTontineById(id: string): Observable<TontineDetailResponse> {
        return this.http.get<TontineDetailResponse>(`${this.API}/${id}`);
    }

    // ── MODIFIER ───────────────────────────────────────────────────────────────
    updateTontine(id: string, payload: Partial<CreateTontinePayload>): Observable<any> {
        return this.http.patch<any>(`${this.API}/${id}`, payload);
    }

    // ── SUPPRIMER ──────────────────────────────────────────────────────────────
    deleteTontine(id: string): Observable<any> {
        return this.http.delete<any>(`${this.API}/${id}`);
    }

    // ── INVITATION ─────────────────────────────────────────────────────────────
    getTontineInvite(id: string): Observable<TontineInviteResponse> {
        return this.http.get<TontineInviteResponse>(`${this.API}/${id}/invite`);
    }

    // ── LABELS LISIBLES EN FRANÇAIS ────────────────────────────────────────────

    frequencyLabel(frequency: Frequency): string {
        const map: Record<Frequency, string> = {
            daily: 'Quotidienne',
            weekly: 'Hebdomadaire',
            biweekly: 'Bimensuelle',
            monthly: 'Mensuelle',
        };
        return map[frequency] ?? frequency;
    }

    typeLabel(type: TontineType): string {
        const map: Record<TontineType, string> = {
            rotative: 'Rotative classique',
            crescendo: 'Crescendo',
            solidarity: 'Solidarité',
            savings_goal: 'Épargne objectif',
        };
        return map[type] ?? type;
    }

    statusLabel(status: TontineStatus): string {
        const map: Record<TontineStatus, string> = {
            pending: 'En attente',
            active: 'En cours',
            completed: 'Terminée',
            cancelled: 'Annulée',
        };
        return map[status] ?? status;
    }

    statusColor(status: TontineStatus): string {
        const map: Record<TontineStatus, string> = {
            pending: 'warning',
            active: 'success',
            completed: 'medium',
            cancelled: 'danger',
        };
        return map[status] ?? 'medium';
    }

    rotationLabel(method: RotationMethod): string {
        const map: Record<RotationMethod, string> = {
            random: 'Aléatoire',
            seniority: 'Ancienneté',
            consensual: 'Consensuel',
            manual: 'Prédéfini par moi',
        };
        return map[method] ?? method;
    }

    securityLabel(model: SecurityModel): string {
        const map: Record<SecurityModel, string> = {
            escrow: 'Escrow collectif',
            direct: 'Virement direct',
            solidarity_guarantee: 'Garantie solidaire',
        };
        return map[model] ?? model;
    }

    visibilityLabel(v: TontineVisibility): string {
        const map: Record<TontineVisibility, string> = {
            private: 'Privée - Sur invitation',
            semi_public: 'Semi-publique',
            public: 'Publique',
        };
        return map[v] ?? v;
    }

    earlyExitLabel(mode: EarlyExitMode): string {
        const map: Record<EarlyExitMode, string> = {
            penalty: 'Autorisée avec pénalité',
            vote: 'Autorisée après vote',
            locked: 'Non autorisée',
        };
        return map[mode] ?? mode;
    }

    earlyExitPenaltyLabel(type: EarlyExitPenalty): string {
        const map: Record<EarlyExitPenalty, string> = {
            guarantee: 'Perte de la caution',
            paid_contributions: 'Perte des cotisations déjà payées',
        };
        return map[type] ?? type;
    }

    // ── UTILITAIRES ────────────────────────────────────────────────────────────

    /** Vider le cache local */
    clearCache(): void {
        this.tontinesSubject.next([]);
    }
}