// ─────────────────────────────────────────────────────────────────────────────
// ÉNUMÉRATIONS
// ─────────────────────────────────────────────────────────────────────────────

export type TontineType = 'rotative' | 'crescendo' | 'solidarity' | 'savings_goal';
export type TontineVisibility = 'private' | 'semi_public' | 'public';
export type TontineStatus = 'pending' | 'active' | 'completed' | 'cancelled';
export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type RotationMethod = 'random' | 'seniority' | 'consensual' | 'manual';
export type SecurityModel = 'escrow' | 'direct' | 'solidarity_guarantee';  
export type PenaltyType = 'percentage' | 'fixed';
export type EarlyExitMode = 'penalty' | 'vote' | 'locked';
export type EarlyExitPenalty = 'guarantee' | 'paid_contributions';
export type MemberRole = 'creator' | 'admin' | 'member';

// ─────────────────────────────────────────────────────────────────────────────
// RÈGLES
// ─────────────────────────────────────────────────────────────────────────────

export interface EarlyExitRules {
    /** 'penalty' | 'vote' | 'locked' */
    mode: EarlyExitMode;
    /** Uniquement renseigné quand mode === 'penalty' */
    penaltyType: EarlyExitPenalty | null;
}

export interface TontineRules {
    // Retards
    gracePeriodDays: 0 | 2 | 3 | 5 | 7;
    penaltyType: PenaltyType;
    penaltyValue: number;
    /** null = jamais (vote requis) */
    autoExclusionDays: 7 | 14 | 30 | null;

    // Sortie anticipée
    earlyExit: EarlyExitRules;

    // Gouvernance
    modificationThreshold: 75 | 100;
    locked: boolean;
    /** Seuil de vote pour la rotation consensuelle (75 %) */
    consensusThreshold: number | null;
}

export interface TontineStats {
    totalCollected: number;
    totalDistributed: number;
    onTimePaymentRate: number;
    averagePaymentDelay: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export interface Tontine {
    id: string;
    name: string;
    description: string | null;
    iconUrl: string | null;

    type: TontineType;
    visibility: TontineVisibility;
    status: TontineStatus;

    amount: number;
    currency: string;
    frequency: Frequency;
    paymentDay: number | null;
    totalMembers: number;
    currentMembers: number;
    potPerTurn: number;

    rotationMethod: RotationMethod;
    currentTurn: number;
    totalTurns: number;

    securityModel: SecurityModel;
    guaranteeAmount: number | null;

    inviteCode: string;
    inviteLink: string;

    rules: TontineRules;
    stats: TontineStats;

    createdBy: string;
    createdAt: any;
    startedAt: any | null;
    endedAt: any | null;
    nextPaymentDate: any;

    // Infos contextuelles du membre connecté
    myRole?: MemberRole;
    myTurnNumber?: number | null;
    myStats?: {
        totalPaid: number;
        totalReceived: number;
        onTimePayments: number;
        latePayments: number;
        missedPayments: number;
        voteParticipation: number;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYLOAD DE CRÉATION
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTontinePayload {
    // Identité
    type: TontineType;
    name: string;
    description?: string;
    iconUrl?: string;
    visibility?: TontineVisibility;

    // Finance
    amount: number;
    frequency: Frequency;
    paymentDay?: number;
    totalMembers: number;

    // Rotation
    rotationMethod: RotationMethod;

    // Règles — retards
    gracePeriodDays?: 0 | 2 | 3 | 5 | 7;
    penaltyType?: PenaltyType;
    penaltyValue?: number;
    /** null = jamais ; absent = valeur par défaut backend */
    autoExclusionDays?: 7 | 14 | 30 | null;

    // Règles — sortie anticipée
    /** 'penalty' | 'vote' | 'locked' */
    earlyExitAllowed: EarlyExitMode;
    /** Requis uniquement si earlyExitAllowed === 'penalty' */
    earlyExitPenaltyType?: EarlyExitPenalty;

    // Gouvernance
    modificationThreshold?: 75 | 100;

    // Sécurité
    securityModel: SecurityModel;
    guaranteeAmount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// RÉPONSES API
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTontineResponse {
    success: boolean;
    message: string;
    data: {
        tontineId: string;
        inviteCode: string;
        inviteLink: string;
        potPerTurn: number;
        totalTurns: number;
        status: TontineStatus;
    };
}

export interface TontineListResponse {
    success: boolean;
    data: Tontine[];
    count: number;
}

export interface TontineDetailResponse {
    success: boolean;
    data: Tontine;
}

export interface TontineInviteResponse {
    success: boolean;
    data: {
        inviteCode: string;
        inviteLink: string;
        qrCodeUrl: string;
        tontineName: string;
        iconUrl: string | null;
        membersCount: string;
    };
}