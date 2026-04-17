// ─────────────────────────────────────────────────────────────────────────────
// ÉNUMÉRATIONS
// ─────────────────────────────────────────────────────────────────────────────

import { firestore } from "firebase-admin";

export type DistributionMethod = 'wave' | 'orange' | 'free' | 'manual';
export type DistributionStatus = 'pending' | 'sent' | 'received' | 'partial';

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export interface Distribution {
    id: string;
    tontineId: string;
    beneficiaryId: string;
    beneficiaryName: string;
    turnNumber: number;
    amount: number;
    sentAmount?: number;
    distributionMethod: DistributionMethod;
    beneficiaryPhone?: string;
    transactionId?: string;
    status: DistributionStatus;
    distributedAt?: firestore.Timestamp | null;
    confirmedAt?: firestore.Timestamp | null;
    receiptUrl?: string;
    metadata?: {
        simulationMode?: boolean;
        isPartial?: boolean;
        tontineName?: string;
        collectionStatus?: {
            paidCount: number;
            totalMembers: number;
            wasComplete: boolean;
        };
        simulatedStatus?: DistributionStatus;
    };
    createdAt?: firestore.Timestamp | firestore.FieldValue | null;
    updatedAt?: firestore.Timestamp | firestore.FieldValue | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAT DE COLLECTE 
// ─────────────────────────────────────────────────────────────────────────────

export interface TurnCollectionStatus {
    tontineId: string;
    turnNumber: number;
    totalMembers: number;
    paidCount: number;
    pendingCount: number;
    unpaidCount: number;
    isComplete: boolean;
    totalCollected: number;
    expectedTotal: number;
    missingMembers: Array<{
        userId: string;
        userName: string | null;
        status: 'pending' | 'unpaid';
    }>;
    // Nouveaux champs pour pré-remplir le formulaire de distribution
    beneficiaryId: string | null;
    beneficiaryPhone: string | null;           // numéro récupéré automatiquement
    beneficiaryPreferredMethod: DistributionMethod | null; // méthode préférée
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION DES MÉTHODES
// ─────────────────────────────────────────────────────────────────────────────

export interface DistributionMethodConfig {
    id: DistributionMethod;
    label: string;
    color: string;
    placeholder: string;
    digitCount: number;
    simulationDelayMs: number;
}

export const DISTRIBUTION_METHODS: DistributionMethodConfig[] = [
    {
        id: 'wave',
        label: 'Wave',
        color: '#1DC8EF',
        placeholder: '7X XXX XX XX',
        digitCount: 9,
        simulationDelayMs: 4000,
    },
    {
        id: 'orange',
        label: 'Orange Money',
        color: '#FF6600',
        placeholder: '7X XXX XX XX',
        digitCount: 9,
        simulationDelayMs: 5000,
    },
    {
        id: 'free',
        label: 'Free Money',
        color: '#E2001A',
        placeholder: '76 XXX XX XX',
        digitCount: 9,
        simulationDelayMs: 4500,
    },
    {
        id: 'manual',
        label: 'Remise en main propre',
        color: '#64748B',
        placeholder: 'Référence ou commentaire',
        digitCount: 0,
        simulationDelayMs: 0,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// PAYLOADS
// ─────────────────────────────────────────────────────────────────────────────

export interface TriggerDistributionPayload {
    tontineId: string;
    distributionMethod: DistributionMethod;
    beneficiaryPhone: string;
    forcePartial?: boolean;
}

export interface ConfirmDistributionPayload {
    distributionId: string;
    tontineId: string;
    transactionId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RÉPONSES API
// ─────────────────────────────────────────────────────────────────────────────

export interface TurnCollectionStatusResponse {
    success: boolean;
    data: TurnCollectionStatus;
}

export interface TriggerDistributionResponse {
    success: boolean;
    message: string;
    data: {
        distributionId: string;
        transactionId: string;
        beneficiaryId: string;
        beneficiaryName: string;
        amount: number;
        status: DistributionStatus;
        simulationDelayMs: number;
        nextTurnStarted: boolean;
        tontineCompleted: boolean;
        collectionStatus: TurnCollectionStatus;
    };
}

export interface ConfirmDistributionResponse {
    success: boolean;
    message: string;
    data: {
        distributionId: string;
        status: DistributionStatus;
        confirmedAt: string;
        receiptUrl?: string;
        nextTurnNumber?: number | null;
        nextBeneficiaryUid?: string | null;
        tontineCompleted: boolean;
    };
}

export interface DistributionListResponse {
    success: boolean;
    data: Distribution[];
    count: number;
}