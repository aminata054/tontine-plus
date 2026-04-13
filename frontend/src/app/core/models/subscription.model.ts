// ─────────────────────────────────────────────────────────────
// ÉNUMÉRATIONS
// ─────────────────────────────────────────────────────────────

export type SubscriptionPlan = 'monthly' | 'annual' | 'premium';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
export type SubscriptionInterval = 'month' | 'year';
export type AccessReason =
    | 'trialing'
    | 'active'
    | 'active_canceling'
    | 'trial_expired'
    | 'canceled_expired'
    | 'no_subscription'
    | 'canceled'
    | 'expired'
    | 'past_due';

// ─────────────────────────────────────────────────────────────
// MODÈLES
// ─────────────────────────────────────────────────────────────

export interface PlanDetails {
    id: SubscriptionPlan;
    label: string;
    amount: number;
    currency: 'XOF';
    interval: SubscriptionInterval;
    description: string;
    trialDays: number;
    savings: number | null;
}

export interface Subscription {
    id: string;
    userId: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    amount: number;
    currency: string;
    interval: SubscriptionInterval;
    currentPeriodStart: any;
    currentPeriodEnd: any;
    cancelAtPeriodEnd: boolean;
    paymentMethod: 'manual' | 'mobile_money';
    transactionId: string | null;
    receiptUrl: string | null;
    subscribedAt: any;
    canceledAt: any | null;
    cancelReason: string | null;
    expiresAt: any | null;          // uniquement en trialing
    previousPlans: SubscriptionPlan[];
    activatedAt: any | null;
    updatedAt: any | null;

    // Champs calculés côté serveur
    effectiveStatus?: SubscriptionStatus;
    hasAccess?: boolean;
    daysRemaining?: number | null;
    planDetails?: PlanDetails;
}

export interface AccessCheckResult {
    hasAccess: boolean;
    reason: AccessReason;
    plan?: SubscriptionPlan;
    daysRemaining?: number;
    trialEndsAt?: string;
    periodEndsAt?: string | null;
    cancelAtPeriodEnd?: boolean;
}

// ─────────────────────────────────────────────────────────────
// PAYLOADS
// ─────────────────────────────────────────────────────────────

export interface ActivateSubscriptionPayload {
    plan: SubscriptionPlan;
    transactionId: string;
    receiptUrl?: string;
}

export interface ChangePlanPayload {
    newPlan: SubscriptionPlan;
}

export interface CancelSubscriptionPayload {
    immediately?: boolean;
    reason?: string;
}

export interface ApplyReferralPayload {
    referralCode: string;
}

// ─────────────────────────────────────────────────────────────
// RÉPONSES API
// ─────────────────────────────────────────────────────────────

export interface SubscriptionResponse {
    success: boolean;
    data: Subscription;
}

export interface PlansResponse {
    success: boolean;
    data: PlanDetails[];
}

export interface AccessCheckResponse {
    success: boolean;
    data: AccessCheckResult;
}

export interface SubscriptionHistoryResponse {
    success: boolean;
    data: Partial<Subscription>[];
    count: number;
}

export interface ActivateSubscriptionResponse {
    success: boolean;
    message: string;
    data: {
        subscriptionId: string;
        plan: SubscriptionPlan;
        status: SubscriptionStatus;
        currentPeriodEnd: string;
        amount: number;
        currency: string;
    };
}