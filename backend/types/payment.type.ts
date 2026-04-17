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
    amount: number;          // cotisation de base
    penaltyAmount: number;   // pénalité de retard (0 si aucune)
    totalAmount: number;     // amount + penaltyAmount

    paymentMethod: PaymentMethod;
    paymentMethodNumber: string;  // numéro Wave, Orange, etc.
    transactionId: string;        // ID généré côté serveur (simulation) ou retourné par l'opérateur

    status: PaymentStatus;

    paidAt?: FirebaseFirestore.Timestamp;
    confirmedAt?: FirebaseFirestore.Timestamp;
    failedAt?: FirebaseFirestore.Timestamp;
    receiptUrl?: string;
    metadata?: Record<string, any>;

    // Vérification manuelle (méthode 'manual')
    verificationStatus?: VerificationStatus;
    verifiedBy?: string;
    verifiedAt?: FirebaseFirestore.Timestamp;

    createdAt: FirebaseFirestore.FieldValue;
    updatedAt?: FirebaseFirestore.FieldValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYLOADS
// ─────────────────────────────────────────────────────────────────────────────

export interface InitiatePaymentPayload {
    tontineId: string;
    paymentMethod: PaymentMethod;
    paymentMethodNumber: string;
    // Si le membre veut payer pour un tour spécifique (défaut : currentTurn)
    turnNumber?: number;
}

export interface VerifyPaymentPayload {
    paymentId: string;
    transactionId?: string; // transmis par l'opérateur dans les webhooks réels
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
        // URL de redirection pour Wave/Orange dans les vraies intégrations
        redirectUrl?: string;
        // Simulateur : délai avant confirmation automatique (ms)
        simulationDelayMs?: number;
    };
}

export interface VerifyPaymentResponse {
    success: boolean;
    message: string;
    data: {
        paymentId: string;
        status: PaymentStatus;
        confirmedAt?: any;
        receiptUrl?: string;
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