// ─────────────────────────────────────────────────────────────────────────────
// TYPES DE VOTES
// ─────────────────────────────────────────────────────────────────────────────

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
// MÉTADONNÉES — avec discriminant `kind` pour le type narrowing
// ─────────────────────────────────────────────────────────────────────────────

export interface RuleChangeMeta {
    kind: 'rule_change';
    field: string;
    currentValue: any;
    proposedValue: any;
    label: string;
}

export interface MemberExclusionMeta {
    kind: 'member_exclusion';
    targetUid: string;
    targetName: string | null;
    reason: string;
}

export interface RoleChangeMeta {
    kind: 'role_change';
    targetUid: string;
    targetName: string | null;
    currentRole: 'admin' | 'member';
    proposedRole: 'admin' | 'member';
}

export interface TurnSwapMeta {
    kind: 'turn_swap';
    uid1: string;
    name1: string | null;
    turn1: number;
    uid2: string;
    name2: string | null;
    turn2: number;
}

export interface EarlyDissolutionMeta {
    kind: 'early_dissolution';
    reason: string;
    proposedEndDate: any | null;
}

export type VoteMeta =
    | RuleChangeMeta
    | MemberExclusionMeta
    | RoleChangeMeta
    | TurnSwapMeta
    | EarlyDissolutionMeta
    | null;

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT VOTE
// ─────────────────────────────────────────────────────────────────────────────

export interface TontineVote {
    id: string;
    tontineId: string;
    type: VoteType;
    status: VoteStatus;
    title: string;
    description: string | null;
    eligibleVoters: string[];
    candidates: string[];
    votes: Record<string, string>;
    result: VoteResult | null;
    winner: string | null;
    requiredThreshold: number;
    meta: VoteMeta;
    turn: number | null;
    createdBy: string;
    createdAt: any;
    expiresAt: any | null;
    closedAt: any | null;
    appliedAt: any | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE GUARDS — utilisés dans les templates et services
// ─────────────────────────────────────────────────────────────────────────────

export function isRuleChangeMeta(meta: VoteMeta): meta is RuleChangeMeta {
    return meta?.kind === 'rule_change';
}

export function isMemberExclusionMeta(meta: VoteMeta): meta is MemberExclusionMeta {
    return meta?.kind === 'member_exclusion';
}

export function isRoleChangeMeta(meta: VoteMeta): meta is RoleChangeMeta {
    return meta?.kind === 'role_change';
}

export function isTurnSwapMeta(meta: VoteMeta): meta is TurnSwapMeta {
    return meta?.kind === 'turn_swap';
}

export function isEarlyDissolutionMeta(meta: VoteMeta): meta is EarlyDissolutionMeta {
    return meta?.kind === 'early_dissolution';
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYLOADS API
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateVotePayload {
    type: VoteType;
    title: string;
    description?: string;
    expiresInHours?: number;
    meta?: Partial<RuleChangeMeta & MemberExclusionMeta & RoleChangeMeta & TurnSwapMeta & EarlyDissolutionMeta>;
}

export interface CastVotePayload {
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