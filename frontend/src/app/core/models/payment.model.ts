// ─────────────────────────────────────────────────────────────────────────────
// ÉNUMÉRATIONS
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentMethod = 'wave' | 'orange' | 'kpay' | 'manual';
export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export interface Payment {
    id: string;
    tontineId: string;
    userId: string;
    userName: string;
    turnNumber: number;
    amount: number;
    penaltyAmount: number;
    totalAmount: number;
    paymentMethod: PaymentMethod;
    paymentMethodNumber: string;
    transactionId: string;
    status: PaymentStatus;
    paidAt?: any;
    confirmedAt?: any;
    failedAt?: any;
    receiptUrl?: string;
    metadata?: {
        daysLate?: number;
        gracePeriod?: number;
        simulationMode?: boolean;
        simulationDelayMs?: number;
        tontineName?: string;
        potPerTurn?: number;
        rejectionReason?: string;
    };
    verificationStatus?: VerificationStatus;
    verifiedBy?: string;
    verifiedAt?: any;
    createdAt?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION DES MÉTHODES DE PAIEMENT
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentMethodConfig {
    id: PaymentMethod;
    label: string;
    logo: string;          // chemin vers l'asset ou emoji
    color: string;         // couleur brand
    placeholder: string;   // placeholder pour le champ numéro
    prefix?: string;       // préfixe numéro (ex: "+221")
    digitCount: number;    // longueur attendue du numéro
}

export const PAYMENT_METHODS: PaymentMethodConfig[] = [
    {
        id: 'wave',
        label: 'Wave',
        logo: 'assets/images/wave-logo.png',
        color: '#1DC8EF',
        placeholder: '7X XXX XX XX',
        digitCount: 9,
    },
    {
        id: 'orange',
        label: 'Orange Money',
        logo: 'assets/images/orange-money-logo.png',
        color: '#FF6600',
        placeholder: '7X XXX XX XX',
        digitCount: 9,
    },
    
    {
        id: 'kpay',
        label: 'Kpay Money',
        logo: 'assets/images/kpay-logo.png',
        color: '#0070B8',
        placeholder: 'XX XX XX XX',
        digitCount: 8,
    },
    {
        id: 'manual',
        label: 'Paiement manuel',
        logo: 'assets/payment/manual.png',
        color: '#64748B',
        placeholder: 'Référence ou numéro de reçu',
        digitCount: 0,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// PAYLOADS
// ─────────────────────────────────────────────────────────────────────────────

export interface InitiatePaymentPayload {
    tontineId: string;
    paymentMethod: PaymentMethod;
    paymentMethodNumber: string;
    turnNumber?: number;
}

export interface VerifyPaymentPayload {
    paymentId: string;
    transactionId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RÉPONSES API
// ─────────────────────────────────────────────────────────────────────────────

export interface InitiatePaymentResponse {
    success: boolean;
    message: string;
    data: {
        paymentId: string;
        transactionId: string;
        amount: number;
        penaltyAmount: number;
        totalAmount: number;
        status: PaymentStatus;
        redirectUrl: string | null;
        simulationDelayMs: number;
        daysLate: number;
        gracePeriod: number;
    };
}

export interface VerifyPaymentResponse {
    success: boolean;
    message: string;
    data: {
        paymentId: string;
        status: PaymentStatus;
        confirmedAt?: string;
        receiptUrl?: string;
        transactionId?: string;
        memberStatsUpdated: boolean;
    };
}

export interface ReceiptResponse {
    success: boolean;
    data: {
        payment: Payment;
        tontineName: string;
        receiptNumber: string;
        generatedAt: string;
    };
}

export interface PaymentsListResponse {
    success: boolean;
    data: Payment[];
    count: number;
}