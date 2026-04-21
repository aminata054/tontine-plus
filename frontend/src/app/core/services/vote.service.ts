import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { tap, takeUntil } from 'rxjs/operators';
import {
    Firestore,
    collection,
    query,
    orderBy,
    onSnapshot,
    where,
    Unsubscribe,
} from '@angular/fire/firestore';
import { environment } from 'src/environments/environment';
import {
    TontineVote,
    VoteType,
    VoteStatus,
    VoteResult,
    CreateVotePayload,
    CastVotePayload,
    VoteListResponse,
    VoteDetailResponse,
    CastVoteResponse,
    CreateVoteResponse,
    RuleChangeMeta,
    MemberExclusionMeta,
    RoleChangeMeta,
    TurnSwapMeta,
    EarlyDissolutionMeta,
} from '../models/vote.model';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION LOCALE — métadonnées d'affichage par type de vote
// ─────────────────────────────────────────────────────────────────────────────

export interface VoteTypeConfig {
    type: VoteType;
    label: string;
    description: string;
    icon: string;
    /** Rôles autorisés à créer ce type de vote */
    allowedRoles: string[] | 'any';
    /** Seuil requis */
    threshold: number;
    /** Si true, nécessite des métadonnées supplémentaires */
    requiresMeta: boolean;
}

export const VOTE_TYPE_CONFIGS: VoteTypeConfig[] = [
    {
        type: 'rule_change',
        label: 'Modifier une règle',
        description: 'Proposer de modifier le montant, la fréquence ou les pénalités',
        icon: 'settings-outline',
        allowedRoles: 'any',
        threshold: 75,
        requiresMeta: true,
    },
    {
        type: 'next_turn_selection',
        label: 'Désigner le prochain bénéficiaire',
        description: 'Voter pour choisir qui reçoit le pot au prochain tour',
        icon: 'person-outline',
        allowedRoles: ['creator', 'admin'],
        threshold: 75,
        requiresMeta: false,
    },
    {
        type: 'member_exclusion',
        label: 'Exclure un membre',
        description: 'Voter pour exclure un membre en raison de manquements répétés',
        icon: 'person-remove-outline',
        allowedRoles: ['creator', 'admin'],
        threshold: 75,
        requiresMeta: true,
    },
    {
        type: 'early_dissolution',
        label: 'Dissoudre la tontine',
        description: 'Mettre fin à la tontine avant son terme',
        icon: 'close-circle-outline',
        allowedRoles: 'any',
        threshold: 100,
        requiresMeta: false,
    },
    {
        type: 'role_change',
        label: 'Changer le rôle d\'un membre',
        description: 'Promouvoir ou rétrograder un membre (admin ↔ membre)',
        icon: 'shield-outline',
        allowedRoles: ['creator'],
        threshold: 51,
        requiresMeta: true,
    },
    {
        type: 'turn_swap',
        label: 'Échanger des tours',
        description: 'Proposer d\'échanger l\'ordre de passage de deux membres',
        icon: 'swap-horizontal-outline',
        allowedRoles: 'any',
        threshold: 51,
        requiresMeta: true,
    },
];

@Injectable({ providedIn: 'root' })
export class VoteService implements OnDestroy {


    private readonly API = environment.apiUrl;
    private destroy$ = new Subject<void>();

    // ── Cache votes par tontineId ────────────────────────────────────────────
    private votesMap = new Map<string, BehaviorSubject<TontineVote[]>>();
    private listeners = new Map<string, Unsubscribe>();

    constructor(
        private http: HttpClient,
        private firestore: Firestore,
    ) { }

    // ─────────────────────────────────────────────────────────────────────────
    // TEMPS RÉEL — onSnapshot Firestore sur les votes ouverts
    // ─────────────────────────────────────────────────────────────────────────
    subscribeToVotes(tontineId: string): Observable<TontineVote[]> {
        if (!this.votesMap.has(tontineId)) {
            this.votesMap.set(tontineId, new BehaviorSubject<TontineVote[]>([]));
        }

        const subject = this.votesMap.get(tontineId)!;

        if (!this.listeners.has(tontineId)) {
            const votesRef = collection(this.firestore, `tontines/${tontineId}/votes`);
            const q = query(votesRef, orderBy('createdAt', 'desc'));

            const unsubscribe = onSnapshot(q, (snap) => {
                const votes = snap.docs.map(d => ({ id: d.id, ...d.data() } as TontineVote));
                subject.next(votes);
            }, (err) => {
                console.error(`[VoteService] onSnapshot error ${tontineId}:`, err);
            });

            this.listeners.set(tontineId, unsubscribe);
        }

        return subject.asObservable();
    }

    unsubscribeFromVotes(tontineId: string): void {
        const unsub = this.listeners.get(tontineId);
        if (unsub) {
            unsub();
            this.listeners.delete(tontineId);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HTTP — CRUD
    // ─────────────────────────────────────────────────────────────────────────

    getVotes(tontineId: string, status?: VoteStatus, type?: VoteType): Observable<VoteListResponse> {
        let url = `${this.API}/tontines/${tontineId}/votes`;
        const params: string[] = [];
        if (status) params.push(`status=${status}`);
        if (type) params.push(`type=${type}`);
        if (params.length) url += '?' + params.join('&');
        return this.http.get<VoteListResponse>(url);
    }

    getVoteById(tontineId: string, voteId: string): Observable<VoteDetailResponse> {
        return this.http.get<VoteDetailResponse>(`${this.API}/tontines/${tontineId}/votes/${voteId}`);
    }

    createVote(tontineId: string, payload: CreateVotePayload): Observable<CreateVoteResponse> {
        return this.http.post<CreateVoteResponse>(
            `${this.API}/tontines/${tontineId}/votes`,
            payload,
        );
    }

    castVote(tontineId: string, voteId: string, choice: string): Observable<CastVoteResponse> {
        return this.http.post<CastVoteResponse>(
            `${this.API}/tontines/${tontineId}/votes/${voteId}/cast`,
            { choice } as CastVotePayload,
        );
    }

    closeVote(tontineId: string, voteId: string): Observable<any> {
        return this.http.patch<any>(`${this.API}/tontines/${tontineId}/votes/${voteId}/close`, {});
    }

    cancelVote(tontineId: string, voteId: string): Observable<any> {
        return this.http.delete<any>(`${this.API}/tontines/${tontineId}/votes/${voteId}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UTILITAIRES UI
    // ─────────────────────────────────────────────────────────────────────────

    /** Config d'affichage pour un type de vote */
    getConfig(type: VoteType): VoteTypeConfig {
        return VOTE_TYPE_CONFIGS.find(c => c.type === type) ?? VOTE_TYPE_CONFIGS[0]!;
    }

    /** Types de votes accessibles selon le rôle de l'utilisateur */
    getAvailableTypes(userRole: string): VoteTypeConfig[] {
        return VOTE_TYPE_CONFIGS.filter(c =>
            c.allowedRoles === 'any' || c.allowedRoles.includes(userRole)
        );
    }

    /** Résultats d'un vote formatés pour l'affichage */
    getVoteResults(vote: TontineVote, totalMembers?: number): {
        choice: string; label: string; count: number; percent: number; isWinner: boolean;
    }[] {
        const totalVoters = totalMembers ?? vote.eligibleVoters.length;
        const voteCounts: Record<string, number> = {};

        for (const c of vote.candidates) voteCounts[c] = 0;
        for (const choice of Object.values(vote.votes ?? {})) {
            voteCounts[choice] = (voteCounts[choice] ?? 0) + 1;
        }

        return vote.candidates.map(c => {
            const count = voteCounts[c] ?? 0;
            return {
                choice: c,
                label: c === 'yes' ? 'Pour' : c === 'no' ? 'Contre' : c,
                count,
                percent: totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0,
                isWinner: c === vote.winner,
            };
        });
    }

    /** Pourcentage de participation */
    getParticipationRate(vote: TontineVote, totalMembers?: number): number {
        const total = totalMembers ?? vote.eligibleVoters.length;
        if (!total) return 0;
        return Math.round((Object.keys(vote.votes ?? {}).length / total) * 100);
    }
    /** Vote de l'utilisateur courant sur ce vote */
    getUserChoice(vote: TontineVote, uid: string): string | null {
        return vote.votes?.[uid] ?? null;
    }

    /** Vérifie si le vote a expiré */
    isExpired(vote: TontineVote): boolean {
        if (!vote.expiresAt) return false;
        const expDate = vote.expiresAt?.toDate ? vote.expiresAt.toDate() : new Date(vote.expiresAt);
        return expDate < new Date();
    }

    /** Temps restant formaté */
    getTimeLeft(vote: TontineVote): string | null {
        if (!vote.expiresAt || vote.status !== 'open') return null;
        const expDate = vote.expiresAt?.toDate ? vote.expiresAt.toDate() : new Date(vote.expiresAt);
        const diff = expDate.getTime() - Date.now();
        if (diff <= 0) return 'Expiré';
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        if (hours > 24) return `${Math.floor(hours / 24)}j restants`;
        if (hours > 0) return `${hours}h ${minutes}m restantes`;
        return `${minutes}m restantes`;
    }

    /** Badge couleur selon le résultat */
    getResultColor(result: VoteResult | null): string {
        switch (result) {
            case 'approved': return 'success';
            case 'rejected': return 'danger';
            case 'no_quorum': return 'warning';
            default: return 'primary';
        }
    }

    /** Libellé du résultat */
    getResultLabel(result: VoteResult | null, status: VoteStatus): string {
        if (status === 'open') return 'En cours';
        if (status === 'cancelled') return 'Annulé';
        switch (result) {
            case 'approved': return 'Approuvé ✅';
            case 'rejected': return 'Rejeté ❌';
            case 'no_quorum': return 'Sans quorum ⚠️';
            default: return 'Clôturé';
        }
    }

    /** Libellé lisible pour les champs de règle */
    getRuleFieldLabel(field: string): string {
        const labels: Record<string, string> = {
            amount: 'Montant de cotisation',
            frequency: 'Fréquence des cotisations',
            paymentDay: 'Jour de paiement',
            'rules.gracePeriodDays': 'Délai de grâce',
            'rules.penaltyValue': 'Valeur de la pénalité',
            'rules.penaltyType': 'Type de pénalité',
            'rules.autoExclusionDays': 'Délai d\'exclusion automatique',
        };
        return labels[field] ?? field;
    }

    /** Formatter une valeur de règle pour l'affichage */
    formatRuleValue(field: string, value: any): string {
        if (field === 'amount') return `${Number(value).toLocaleString('fr-FR')} FCFA`;
        if (field === 'frequency') {
            const map: Record<string, string> = {
                daily: 'Quotidienne', weekly: 'Hebdomadaire',
                biweekly: 'Bimensuelle', monthly: 'Mensuelle',
            };
            return map[value] ?? value;
        }
        if (field === 'rules.gracePeriodDays') return `${value} jour(s)`;
        if (field === 'rules.autoExclusionDays') return value === null ? 'Jamais' : `${value} jours`;
        if (field === 'rules.penaltyType') return value === 'percentage' ? 'Pourcentage' : 'Montant fixe';
        if (field === 'rules.penaltyValue') return `${value}`;
        return String(value);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NETTOYAGE
    // ─────────────────────────────────────────────────────────────────────────
    clearCache(tontineId?: string): void {
        if (tontineId) {
            this.unsubscribeFromVotes(tontineId);
            this.votesMap.delete(tontineId);
        } else {
            this.listeners.forEach(u => u());
            this.listeners.clear();
            this.votesMap.clear();
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.clearCache();
    }
}