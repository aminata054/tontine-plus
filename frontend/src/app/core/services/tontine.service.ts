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
    JoinPreviewResponse,
    JoinTontineResponse,
    MembersListResponse,
    MemberStatus,
    RotationMethod,
    SecurityModel,
    Tontine,
    TontineDetailResponse,
    TontineInviteResponse,
    TontineListResponse,
    TontineMember,
    TontineStatus,
    TontineType,
    TontineVisibility,
    ValidateMemberPayload,
    ValidateMemberResponse,
} from '../models/tontine.model';

@Injectable({ providedIn: 'root' })
export class TontineService {

    private readonly API = environment.apiUrl + '/tontines';

    /** Cache local de la liste des tontines de l'utilisateur */
    private tontinesSubject = new BehaviorSubject<Tontine[]>([]);
    public tontines$ = this.tontinesSubject.asObservable();
    /** Cache des membres en attente par tontineId */
    private pendingMembersMap = new Map<string, BehaviorSubject<TontineMember[]>>();

    constructor(private http: HttpClient) { }

    // ── CRÉER ──────────────────────────────────────────────────────────────────
    createTontine(payload: CreateTontinePayload): Observable<CreateTontineResponse> {
        return this.http.post<CreateTontineResponse>(this.API, payload);
    }

    // ── TOUR SUIVANT ───────────────────────────────────────────────────────────────
    processNextTurn(
        tontineId: string,
        nextBeneficiaryUid?: string  // requis uniquement si rotationMethod === 'manual'
    ): Observable<any> {
        const body = nextBeneficiaryUid ? { nextBeneficiaryUid } : {};
        return this.http.post<any>(`${this.API}/${tontineId}/next-turn`, body).pipe(
            tap((res) => {
                // Si la tontine vient de se terminer, invalider le cache
                if (res.success && res.data?.tontineCompleted) {
                    this.getMyTontines().subscribe();
                }
            })
        );
    }

    // ── VOTE CONSENSUEL ────────────────────────────────────────────────────────────
    castVote(tontineId: string, voteId: string, candidateUid: string): Observable<any> {
        return this.http.post<any>(
            `${this.API}/${tontineId}/votes/${voteId}/cast`,
            { candidateUid }
        );
    }

    // ── LANCER LA TONTINE ──────────────────────────────────────────────────────────
    launchTontine(tontineId: string, nextBeneficiaryUid?: string): Observable<any> {
        const body = nextBeneficiaryUid ? { nextBeneficiaryUid } : {};
        return this.http.post<any>(`${this.API}/${tontineId}/launch`, body).pipe(
            tap((res) => {
                if (res.success) {
                    this.getMyTontines().subscribe(); // Invalider le cache
                }
            })
        );
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

    // ── PREVIEW (avant de rejoindre) ───────────────────────────────────────────

    /**
     * Récupère la preview publique d'une tontine via son code d'invitation.
     * Peut être appelé avant que l'utilisateur soit connecté.
     */
    getJoinPreview(code: string): Observable<JoinPreviewResponse> {
        return this.http.get<JoinPreviewResponse>(
            `${this.API}/join/${encodeURIComponent(code.toUpperCase().trim())}`
        );
    }

    // ── REJOINDRE ──────────────────────────────────────────────────────────────

    /**
     * L'utilisateur authentifié confirme qu'il veut rejoindre la tontine.
     * Retourne le statut : 'active' (auto-accepté) ou 'pending_approval'.
     */
    joinTontine(code: string): Observable<JoinTontineResponse> {
        return this.http
            .post<JoinTontineResponse>(
                `${this.API}/join/${encodeURIComponent(code.toUpperCase().trim())}`,
                {}
            )
            .pipe(
                tap((res) => {
                    // Si auto-accepté, rafraîchir la liste des tontines du cache
                    if (res.success && res.data.autoAccepted) {
                        this.getMyTontines().subscribe();
                    }
                })
            );
    }

    // ── LISTE DES MEMBRES ──────────────────────────────────────────────────────

    /**
     * Récupère les membres d'une tontine.
     * @param tontineId  ID de la tontine
     * @param status     Filtre optionnel (ex: 'pending_approval' pour la vue admin)
     */
    getTontineMembers(
        tontineId: string,
        status?: MemberStatus
    ): Observable<MembersListResponse> {
        const params: Record<string, string> = {};
        if (status) params['status'] = status;

        return this.http
            .get<MembersListResponse>(`${this.API}/${tontineId}/members`, { params })
            .pipe(
                tap((res) => {
                    if (res.success && status === 'pending_approval') {
                        this.getPendingSubject(tontineId).next(res.data);
                    }
                })
            );
    }

    /**
     * Raccourci pour la vue admin : uniquement les membres en attente.
     */
    getPendingMembers(tontineId: string): Observable<MembersListResponse> {
        return this.getTontineMembers(tontineId, 'pending_approval');
    }

    /**
     * Observable réactif des membres en attente (BehaviorSubject).
     * Utile pour mettre à jour la vue en temps réel après validation.
     */
    pendingMembers$(tontineId: string): Observable<TontineMember[]> {
        return this.getPendingSubject(tontineId).asObservable();
    }

    // ── VALIDER / REFUSER ──────────────────────────────────────────────────────

    /**
     * Accepte ou refuse la demande d'un membre.
     * Met à jour automatiquement le cache des pending.
     */
    validateMember(
        tontineId: string,
        memberUid: string,
        action: 'accept' | 'reject'
    ): Observable<ValidateMemberResponse> {
        const payload: ValidateMemberPayload = { action };

        return this.http
            .patch<ValidateMemberResponse>(
                `${this.API}/${tontineId}/members/${memberUid}/validate`,
                payload
            )
            .pipe(
                tap((res) => {
                    if (res.success) {
                        // Retirer le membre validé de la liste pending en cache
                        const subject = this.getPendingSubject(tontineId);
                        const updated = subject.value.filter((m) => m.id !== memberUid);
                        subject.next(updated);

                        // Si la tontine vient de démarrer, invalider le cache global
                        if (res.data.tontineAutoStarted) {
                            this.getMyTontines().subscribe();
                        }
                    }
                })
            );
    }


    getMemberProfile(tontineId: string, memberId: string) {
        return this.http.get<any>(
            `/api/v1/tontines/${tontineId}/members/${memberId}`
        );
    }

    // ── RACCOURCIS ─────────────────────────────────────────────────────────────

    acceptMember(tontineId: string, memberUid: string): Observable<ValidateMemberResponse> {
        return this.validateMember(tontineId, memberUid, 'accept');
    }

    rejectMember(tontineId: string, memberUid: string): Observable<ValidateMemberResponse> {
        return this.validateMember(tontineId, memberUid, 'reject');
    }

    // ── LABELS ─────────────────────────────────────────────────────────────────

    memberStatusLabel(status: MemberStatus): string {
        const map: Record<MemberStatus, string> = {
            active: 'Actif',
            pending_approval: 'En attente',
            rejected: 'Refusé',
            left: 'A quitté',
            excluded: 'Exclu',
        };
        return map[status] ?? status;
    }

    memberStatusColor(status: MemberStatus): string {
        const map: Record<MemberStatus, string> = {
            active: 'success',
            pending_approval: 'warning',
            rejected: 'danger',
            left: 'medium',
            excluded: 'danger',
        };
        return map[status] ?? 'medium';
    }

    // ── UTILITAIRES PRIVÉS ─────────────────────────────────────────────────────

    private getPendingSubject(tontineId: string): BehaviorSubject<TontineMember[]> {
        if (!this.pendingMembersMap.has(tontineId)) {
            this.pendingMembersMap.set(tontineId, new BehaviorSubject<TontineMember[]>([]));
        }
        return this.pendingMembersMap.get(tontineId)!;
    }

    /** Vider le cache d'une tontine (ex: en quittant la page) */
    clearPendingCache(tontineId: string): void {
        this.pendingMembersMap.delete(tontineId);
    }

}