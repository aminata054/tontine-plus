// ─────────────────────────────────────────────────────────────────────────────
// TYPES DE VOTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tous les types de votes supportés par l'application.
 *
 * - next_turn_selection  → désigner le bénéficiaire du prochain tour (mode consensuel)
 * - rule_change          → modifier une règle de la tontine (montant, fréquence, pénalités…)
 * - member_exclusion     → exclure un membre après manquements répétés
 * - early_dissolution    → dissoudre la tontine avant son terme
 * - role_change          → promouvoir / rétrograder un membre (admin ↔ member)
 * - turn_swap            → échanger l'ordre de passage de deux membres
 */
export type VoteType =
    | 'next_turn_selection'
    | 'rule_change'
    | 'member_exclusion'
    | 'early_dissolution'
    | 'role_change'
    | 'turn_swap';

export type VoteStatus = 'open' | 'closed' | 'cancelled';

export type VoteResult = 'approved' | 'rejected' | 'no_quorum';

// ─────────────────────────────────────────────────────────────────────────────
// MÉTADONNÉES SPÉCIFIQUES PAR TYPE
// ─────────────────────────────────────────────────────────────────────────────

/** Détail d'une modification de règle proposée */
export interface RuleChangeMeta {
    field: string;        // ex: 'amount', 'frequency', 'rules.gracePeriodDays'
    currentValue: any;
    proposedValue: any;
    label: string;        // libellé lisible : "Montant de cotisation"
}

/** Détail d'une exclusion de membre */
export interface MemberExclusionMeta {
    targetUid: string;
    targetName: string | null;
    reason: string;       // motif fourni par le proposant
}

/** Détail d'un changement de rôle */
export interface RoleChangeMeta {
    targetUid: string;
    targetName: string | null;
    currentRole: 'admin' | 'member';
    proposedRole: 'admin' | 'member';
}

/** Détail d'un échange de tours */
export interface TurnSwapMeta {
    uid1: string;
    name1: string | null;
    turn1: number;
    uid2: string;
    name2: string | null;
    turn2: number;
}

/** Détail d'une dissolution anticipée */
export interface EarlyDissolutionMeta {
    reason: string;
    proposedEndDate: any | null; // Timestamp ou null (immédiat)
}

/** Union de toutes les métadonnées */
export type VoteMeta =
    | RuleChangeMeta
    | MemberExclusionMeta
    | RoleChangeMeta
    | TurnSwapMeta
    | EarlyDissolutionMeta
    | null;

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT VOTE (Firestore : tontines/{id}/votes/{voteId})
// ─────────────────────────────────────────────────────────────────────────────

export interface TontineVote {
    id: string;
    tontineId: string;
    type: VoteType;
    status: VoteStatus;

    /** Question affichée aux membres */
    title: string;
    description: string | null;

    /** UID des membres éligibles à voter (tous les actifs par défaut) */
    eligibleVoters: string[];

    /**
     * Pour next_turn_selection : liste des candidats (uid[])
     * Pour les autres types : ['yes', 'no'] implicitement
     */
    candidates: string[];

    /** { uid: candidateId | 'yes' | 'no' } */
    votes: Record<string, string>;

    /** Résultat calculé après clôture */
    result: VoteResult | null;
    winner: string | null;        // uid du gagnant (next_turn) ou null

    /** Seuil de participation requis (% des membres éligibles) */
    requiredThreshold: number;    // ex: 75 → 75%

    /** Métadonnées spécifiques au type de vote */
    meta: VoteMeta;

    /** Numéro du tour concerné (next_turn_selection uniquement) */
    turn: number | null;

    createdBy: string;
    createdAt: any;
    expiresAt: any | null;
    closedAt: any | null;
    appliedAt: any | null;        // date d'application de l'effet (si approved)
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYLOADS API
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateVotePayload {
    type: VoteType;
    title: string;
    description?: string;
    expiresInHours?: number;
    // Champs conditionnels selon le type
    meta?: Partial<RuleChangeMeta & MemberExclusionMeta & RoleChangeMeta & TurnSwapMeta & EarlyDissolutionMeta>;
}

export interface CastVotePayload {
    /** uid d'un candidat (next_turn) ou 'yes' | 'no' pour les autres types */
    choice: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RÉPONSES API
// ─────────────────────────────────────────────────────────────────────────────

export interface VoteListResponse {
    success: boolean;
    data: TontineVote[];
    count: number;
}

export interface VoteDetailResponse {
    success: boolean;
    data: TontineVote;
}

export interface CastVoteResponse {
    success: boolean;
    message: string;
    data: {
        voteCounts: Record<string, number>;
        totalVotes: number;
        quorumReached: boolean;
        winner: string | null;
        result: VoteResult | null;
    };
}

export interface CreateVoteResponse {
    success: boolean;
    message: string;
    data: {
        voteId: string;
        type: VoteType;
        requiredThreshold: number;
        eligibleVotersCount: number;
    };
}