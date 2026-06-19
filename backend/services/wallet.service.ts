import * as admin from 'firebase-admin';
import { db } from '../config/firebase';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface WalletContribution {
    userId: string;
    userName: string;
    amount: number;
    paidAt: admin.firestore.Timestamp | null;
    turnNumber: number;
}

export interface TontineWallet {
    tontineId: string;
    currentTurn: number;
    balance: number;
    targetAmount: number;
    status: 'collecting' | 'ready' | 'distributed';
    contributions: WalletContribution[];
    lastDistributedAt: admin.firestore.Timestamp | null;
    updatedAt: admin.firestore.Timestamp;
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZE WALLET FOR A TONTINE
// Appelé lors du démarrage de la tontine ou du passage à un nouveau tour.
// Peut être appelé dans ou hors transaction.
// ─────────────────────────────────────────────────────────────────────────────
export const initializeWallet = async (
    tontineId: string,
    turnNumber: number,
    targetAmount: number,
    transaction?: admin.firestore.Transaction
): Promise<void> => {
    const walletRef = db.collection('tontineWallets').doc(tontineId);

    const walletData: Omit<TontineWallet, 'updatedAt'> & { updatedAt: admin.firestore.FieldValue } = {
        tontineId,
        currentTurn: turnNumber,
        balance: 0,
        targetAmount,
        status: 'collecting',
        contributions: [],
        lastDistributedAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (transaction) {
        transaction.set(walletRef, walletData, { merge: false });
    } else {
        await walletRef.set(walletData, { merge: false });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// READ WALLET SNAPSHOT (à appeler AVANT la transaction, en dehors)
//
// FIX "reads before writes" : Firestore interdit tout read après un premier
// write dans la même transaction. On expose donc le read séparément pour que
// le contrôleur puisse l'exécuter avant d'ouvrir la transaction.
// ─────────────────────────────────────────────────────────────────────────────
export const readWalletSnapshot = async (
    tontineId: string
): Promise<{
    ref: admin.firestore.DocumentReference;
    exists: boolean;
    balance: number;
    targetAmount: number;
    contributions: WalletContribution[];
    currentTurn: number;
}> => {
    const ref = db.collection('tontineWallets').doc(tontineId);
    const snap = await ref.get();

    return {
        ref,
        exists: snap.exists,
        balance: snap.data()?.balance ?? 0,
        targetAmount: snap.data()?.targetAmount ?? 0,
        contributions: snap.data()?.contributions ?? [],
        currentTurn: snap.data()?.currentTurn ?? 0,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// APPLY CONTRIBUTION WRITE (uniquement des writes — pas de reads internes)
//
// Reçoit le snapshot pré-lu et applique le write dans la transaction.
// À appeler DANS la transaction, après avoir passé le snapshot lu en dehors.
// ─────────────────────────────────────────────────────────────────────────────
export const applyContributionWrite = (
    transaction: admin.firestore.Transaction,
    walletSnapshot: Awaited<ReturnType<typeof readWalletSnapshot>>,
    contribution: WalletContribution,
    tontineId: string
): void => {
    const { ref, exists, balance, targetAmount, contributions } = walletSnapshot;

    // Éviter les doublons (sécurité)
    const alreadyAdded = contributions.some(
        c => c.userId === contribution.userId && c.turnNumber === contribution.turnNumber
    );
    if (alreadyAdded) return;

    const newBalance = balance + contribution.amount;
    const newContributions = [...contributions, contribution];
    const newStatus: TontineWallet['status'] =
        targetAmount > 0 && newBalance >= targetAmount ? 'ready' : 'collecting';

    if (!exists) {
        // Wallet pas encore initialisé — le créer à la volée
        transaction.set(ref, {
            tontineId,
            currentTurn: contribution.turnNumber,
            balance: newBalance,
            targetAmount,                 // sera 0 si pas encore init, corrigé à l'init réelle
            status: newStatus,
            contributions: newContributions,
            lastDistributedAt: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    } else {
        transaction.update(ref, {
            balance: newBalance,
            status: newStatus,
            contributions: newContributions,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY WALLET AFTER DISTRIBUTION (write seul — safe dans une transaction)
// ─────────────────────────────────────────────────────────────────────────────
export const emptyWalletAfterDistribution = (
    transaction: admin.firestore.Transaction,
    tontineId: string
): void => {
    const walletRef = db.collection('tontineWallets').doc(tontineId);
    transaction.update(walletRef, {
        status: 'distributed',
        lastDistributedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESET WALLET FOR NEXT TURN (write seul — safe dans une transaction)
// ─────────────────────────────────────────────────────────────────────────────
export const resetWalletForNextTurn = (
    transaction: admin.firestore.Transaction,
    tontineId: string,
    nextTurnNumber: number,
    nextTargetAmount: number
): void => {
    const walletRef = db.collection('tontineWallets').doc(tontineId);
    transaction.update(walletRef, {
        currentTurn: nextTurnNumber,
        balance: 0,
        targetAmount: nextTargetAmount,
        status: 'collecting',
        contributions: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET WALLET (lecture simple hors transaction)
// ─────────────────────────────────────────────────────────────────────────────
export const getWallet = async (tontineId: string): Promise<TontineWallet | null> => {
    const doc = await db.collection('tontineWallets').doc(tontineId).get();
    if (!doc.exists) return null;
    return doc.data() as TontineWallet;
};