import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { buildNotificationDoc, sendNotificationToUser } from './notification.service';
import { Payment, PaymentMethod, PaymentStatus } from '../types/payment.type';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Génère un ID de transaction unique pour la simulation.
 * Format : SIM-<METHOD>-<TIMESTAMP>-<RANDOM>
 */
export const generateTransactionId = (method: PaymentMethod): string => {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SIM-${method.toUpperCase()}-${Date.now()}-${rand}`;
};

/**
 * Génère un numéro de reçu lisible.
 * Format : REC-<YEAR>-<PADDED_SEQUENCE>
 */
export const generateReceiptNumber = (paymentId: string): string => {
    const year = new Date().getFullYear();
    const suffix = paymentId.slice(-6).toUpperCase();
    return `REC-${year}-${suffix}`;
};

/**
 * Calcule le montant de pénalité selon les règles de la tontine.
 *
 * @param baseAmount   Cotisation de base
 * @param penaltyType  'percentage' | 'fixed'
 * @param penaltyValue Valeur de la pénalité
 * @param daysLate     Nombre de jours de retard
 * @param gracePeriod  Jours de grâce (pas de pénalité pendant cette période)
 */
export const computePenalty = (
    baseAmount: number,
    penaltyType: 'percentage' | 'fixed',
    penaltyValue: number,
    daysLate: number,
    gracePeriod: number = 0
): number => {
    const effectiveDays = Math.max(0, daysLate - gracePeriod);
    if (effectiveDays <= 0 || !penaltyValue) return 0;

    if (penaltyType === 'percentage') {
        // Pénalité = montant × taux% × jours effectifs
        return Math.round(baseAmount * (penaltyValue / 100) * effectiveDays);
    }
    // Pénalité fixe par jour de retard
    return penaltyValue * effectiveDays;
};

/**
 * Calcule le nombre de jours de retard par rapport à la nextPaymentDate de la tontine.
 */
export const computeDaysLate = (nextPaymentDate: any): number => {
    if (!nextPaymentDate) return 0;

    let dueDate: Date;

    // Gérer tous les formats possibles de Firestore
    if (typeof nextPaymentDate.toDate === 'function') {
        dueDate = nextPaymentDate.toDate();
    } else if (nextPaymentDate._seconds !== undefined) {
        dueDate = new Date(nextPaymentDate._seconds * 1000);
    } else if (nextPaymentDate.seconds !== undefined) {
        dueDate = new Date(nextPaymentDate.seconds * 1000);
    } else if (nextPaymentDate instanceof Date) {
        dueDate = nextPaymentDate;
    } else {
        const parsed = new Date(nextPaymentDate);
        if (isNaN(parsed.getTime())) return 0;
        dueDate = parsed;
    }

    const diffMs = Date.now() - dueDate.getTime();
    if (diffMs <= 0) return 0;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Génère l'URL du reçu (dans la vraie app : lien vers un PDF généré ou Firestore Storage).
 * En simulation, on retourne un lien local.
 */
export const generateReceiptUrl = (paymentId: string): string => {
    return `https://tontineplus.app/receipts/${paymentId}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION — Délais et résultats selon la méthode de paiement
// ─────────────────────────────────────────────────────────────────────────────

interface SimulationConfig {
    /** Délai avant confirmation automatique (ms) */
    delayMs: number;
    /** Taux de succès simulé (0-1) */
    successRate: number;
    /** Message affiché à l'utilisateur pendant l'attente */
    pendingMessage: string;
}

export const SIMULATION_CONFIG: Record<PaymentMethod, SimulationConfig> = {
    wave: { delayMs: 3000, successRate: 0.95, pendingMessage: 'En attente de confirmation Wave...' },
    orange: { delayMs: 4000, successRate: 0.92, pendingMessage: 'En attente de confirmation Orange Money...' },
    kpay: { delayMs: 3500, successRate: 0.90, pendingMessage: 'En attente de confirmation Kpay Money...' },
    manual: { delayMs: 0, successRate: 1.00, pendingMessage: 'Paiement manuel — en attente de vérification' },
};

// ─────────────────────────────────────────────────────────────────────────────
// VÉRIFICATION — Simule la réponse de l'opérateur mobile money
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simule la vérification d'un paiement mobile money.
 * Dans la vraie intégration, cette fonction appellera l'API Wave/Orange.
 *
 * @returns 'confirmed' | 'failed'
 */
export const simulateOperatorVerification = (method: PaymentMethod): PaymentStatus => {
    if (method === 'manual') return 'pending'; // Manuel = vérification humaine
    const config = SIMULATION_CONFIG[method];
    return Math.random() < config.successRate ? 'confirmed' : 'failed';
};

// ─────────────────────────────────────────────────────────────────────────────
// MISE À JOUR DES STATS MEMBRE après confirmation
// ─────────────────────────────────────────────────────────────────────────────

export const updateMemberStatsAfterPayment = async (
    tontineId: string,
    userId: string,
    amount: number,
    isLate: boolean,
    transaction?: admin.firestore.Transaction
): Promise<void> => {
    const memberRef = db
        .collection('tontines').doc(tontineId)
        .collection('members').doc(userId);

    const statsUpdate: Record<string, any> = {
        'stats.totalPaid': admin.firestore.FieldValue.increment(amount),
    };

    if (isLate) {
        statsUpdate['stats.latePayments'] = admin.firestore.FieldValue.increment(1);
    } else {
        statsUpdate['stats.onTimePayments'] = admin.firestore.FieldValue.increment(1);
    }

    if (transaction) {
        transaction.update(memberRef, statsUpdate);
    } else {
        await memberRef.update(statsUpdate);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// MISE À JOUR DES STATS TONTINE après confirmation
// ─────────────────────────────────────────────────────────────────────────────

export const updateTontineStatsAfterPayment = async (
    tontineId: string,
    amount: number,
    transaction?: admin.firestore.Transaction
): Promise<void> => {
    const tontineRef = db.collection('tontines').doc(tontineId);

    const statsUpdate = {
        'stats.totalCollected': admin.firestore.FieldValue.increment(amount),
    };

    if (transaction) {
        transaction.update(tontineRef, statsUpdate);
    } else {
        await tontineRef.update(statsUpdate);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// VÉRIFIER SI UN MEMBRE A DÉJÀ PAYÉ CE TOUR
// ─────────────────────────────────────────────────────────────────────────────

export const hasAlreadyPaidTurn = async (
    tontineId: string,
    userId: string,
    turnNumber: number
): Promise<boolean> => {
    const existing = await db
        .collection('payments')
        .where('tontineId', '==', tontineId)
        .where('userId', '==', userId)
        .where('turnNumber', '==', turnNumber)
        .where('status', 'in', ['pending', 'confirmed'])
        .limit(1)
        .get();

    return !existing.empty;
};

// ─────────────────────────────────────────────────────────────────────────────
// RÉCUPÉRER L'HISTORIQUE DES PAIEMENTS D'UN MEMBRE DANS UNE TONTINE
// ─────────────────────────────────────────────────────────────────────────────

export const getMemberPayments = async (
    tontineId: string,
    userId: string
): Promise<Payment[]> => {
    const snap = await db
        .collection('payments')
        .where('tontineId', '==', tontineId)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
};