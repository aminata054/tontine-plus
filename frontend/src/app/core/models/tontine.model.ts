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

export type MemberStatus = 'active' | 'pending_approval' | 'rejected' | 'left' | 'excluded';

// ─────────────────────────────────────────────────────────────
// MODÈLES
// ─────────────────────────────────────────────────────────────

export interface TontinePreview {
    tontineId: string;
    createdBy: string;
    creatorName: string | null;
    estimatedDuration: number | null;
    name: string;
    description: string | null;
    iconUrl: string | null;
    type: TontineType;
    visibility: string;
    amount: number;
    currency: string;
    frequency: Frequency;
    potPerTurn: number;
    totalMembers: number;
    currentMembers: number;
    slotsLeft: number;
    rotationMethod: RotationMethod;
    securityModel: SecurityModel;
    nextPaymentDate: any;
    rules: {
        gracePeriodDays: number;
        penaltyType: string | null;
        penaltyValue: number;
        earlyExit: { mode: string; penaltyType: string | null } | null;
        autoExclusionDays: number | null;
    };
    // Contextuel si authentifié
    alreadyMember: boolean;
    memberStatus: MemberStatus | null;
}

export interface TontineMember {
    id: string;
    tontineId: string;
    userId: string;
    userName: string | null;
    userPhotoUrl: string | null;
    role: MemberRole;
    status: MemberStatus;
    turnNumber: number | null;
    joinedAt: any;
    validatedAt: any | null;
    rejectedAt: any | null;
    leftAt: any | null;
    excludedAt: any | null;
    stats: {
        totalPaid: number;
        totalReceived: number;
        onTimePayments: number;
        latePayments: number;
        missedPayments: number;
        voteParticipation: number;
    };
}

// ─────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────

export type NotificationType =
    | 'join_request'
    | 'join_accepted'
    | 'join_rejected'
    | 'tontine_started';

export interface TontineNotification {
    id: string;
    type: NotificationType;
    recipientUid: string;
    senderUid?: string;
    senderName?: string;
    senderPhotoUrl?: string | null;
    tontineId: string;
    tontineName: string;
    read: boolean;
    createdAt: any;
}

// ─────────────────────────────────────────────────────────────
// RÉPONSES API
// ─────────────────────────────────────────────────────────────

export interface JoinPreviewResponse {
    success: boolean;
    data: TontinePreview;
}

export interface JoinTontineResponse {
    success: boolean;
    message: string;
    data: {
        tontineId: string;
        memberStatus: MemberStatus;
        autoAccepted: boolean;
    };
}

export interface MembersListResponse {
    success: boolean;
    data: TontineMember[];
    count: number;
    tontineName: string;
}

export interface ValidateMemberResponse {
    success: boolean;
    message: string;
    data: {
        memberUid: string;
        newStatus: MemberStatus;
        tontineAutoStarted: boolean;
    };
}

// ─────────────────────────────────────────────────────────────
// PAYLOAD
// ─────────────────────────────────────────────────────────────

export interface ValidateMemberPayload {
    action: 'accept' | 'reject';
}


export interface TurnItem {
    number: number;
    memberId: string;
    memberName: string;
    dateLabel: string;
    isMe: boolean;
    isCurrent: boolean;
    isDone: boolean;
    estimatedDate: Date | null;
}

export interface MyContribution {
    status: 'paid' | 'due' | 'late';
    paidAt?: any;
    paymentId?: string; 
    receiptRef?: string;
    receiptUrl?: string; 
    dueDate?: any;
    timeLeft?: string;
    penalty?: number;
    totalDue?: number;
    daysLate?: number;
}

export interface HistoryEntry {
    date: any;
    description?: string;
    turnNumber?: number;
    beneficiary?: string;
    amount?: number;
    method?: string;
    transactionId?: string;
    status?: string;
    expanded: boolean;
}

export interface PageStats {
    totalCollected: number;
    currentBeneficiary: string;
    nextDate: any;
    paidCount: number;
    unpaidCount: number;
    punctualityRate: number;
    completedTurns: number;
    nextDueLabel: string;
}