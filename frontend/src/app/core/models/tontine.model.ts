export interface TontineRules {
    gracePeriodDays: number;
    penaltyType: 'percentage' | 'fixed';
    penaltyValue: number;
    autoExclusionDays: number | null;
    earlyExitAllowed: boolean;
    earlyExitPenaltyType: 'percentage' | 'fixed' | null;
    earlyExitPenaltyValue: number | null;
    modificationThreshold: 50 | 75 | 100;
    locked: boolean;
}

export interface TontineStats {
    totalCollected: number;
    totalDistributed: number;
    onTimePaymentRate: number;
    averagePaymentDelay: number;
}

export interface Tontine {
    id: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    type: 'rotative' | 'crescendo';
    visibility: 'private' | 'semi_public' | 'public';
    status: 'pending' | 'active' | 'completed' | 'cancelled';
    amount: number;
    currency: string;
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    paymentDay: number | null;
    totalMembers: number;
    currentMembers: number;
    potPerTurn: number;
    rotationMethod: 'random' | 'seniority' | 'consensual' | 'manual';
    currentTurn: number;
    totalTurns: number;
    securityModel: 'escrow' | 'direct' | 'blocked_account' | 'solidarity';
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
    myRole?: 'creator' | 'admin' | 'member';
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

export interface CreateTontinePayload {
    type: 'rotative' | 'crescendo';
    name: string;
    description?: string;
    iconUrl?: string;
    visibility?: 'private' | 'semi_public' | 'public';
    amount: number;
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    paymentDay?: number;
    totalMembers: number;
    rotationMethod: 'random' | 'seniority' | 'consensual' | 'manual';
    gracePeriodDays?: number;
    penaltyType?: 'percentage' | 'fixed';
    penaltyValue?: number;
    autoExclusionDays?: number;
    earlyExitAllowed?: boolean;
    earlyExitPenaltyType?: 'percentage' | 'fixed';
    earlyExitPenaltyValue?: number;
    modificationThreshold?: 50 | 75 | 100;
    securityModel: 'escrow' | 'direct' | 'blocked_account' | 'solidarity';
    guaranteeAmount?: number;
}

export interface CreateTontineResponse {
    success: boolean;
    message: string;
    data: {
        tontineId: string;
        inviteCode: string;
        inviteLink: string;
        potPerTurn: number;
        totalTurns: number;
        status: string;
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
