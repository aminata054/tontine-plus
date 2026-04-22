import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { buildNotificationDoc } from './notification.service';
import {
    Distribution,
    DistributionMethod,
    DistributionStatus,
    TurnCollectionStatus,
} from '../types/distribution.type';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────────────────────────────────────

export const generateDistributionTransactionId = (method: DistributionMethod): string => {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `DIST-${method.toUpperCase()}-${Date.now()}-${rand}`;
};

export const generateDistributionReceiptUrl = (distributionId: string): string => {
    return `https://tontineplus.app/distributions/${distributionId}/receipt`;
};

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION
// ─────────────────────────────────────────────────────────────────────────────

export interface DistributionSimConfig {
    delayMs: number;
    successRate: number;
    pendingMessage: string;
}

export const DISTRIBUTION_SIM_CONFIG: Record<DistributionMethod, DistributionSimConfig> = {
    wave: { delayMs: 4000, successRate: 0.97, pendingMessage: 'Envoi Wave en cours…' },
    orange: { delayMs: 5000, successRate: 0.93, pendingMessage: 'Envoi Orange Money en cours…' },
    free: { delayMs: 4500, successRate: 0.91, pendingMessage: 'Envoi Free Money en cours…' },
    manual: { delayMs: 0, successRate: 1.00, pendingMessage: 'Distribution manuelle enregistrée' },
};

export const simulateDistributionSend = (method: DistributionMethod): DistributionStatus => {
    if (method === 'manual') return 'sent';
    const config = DISTRIBUTION_SIM_CONFIG[method];
    return Math.random() < config.successRate ? 'sent' : 'partial';
};

// ─────────────────────────────────────────────────────────────────────────────
// BUG #1 FIX — RÉCUPÉRER LE NUMÉRO DU BÉNÉFICIAIRE AUTOMATIQUEMENT
//
// On cherche d'abord sur le doc membre (champ `phone` ou `paymentPhone`),
// puis sur le doc utilisateur si absent.
// Retourne null si aucun numéro trouvé (l'admin devra le saisir).
// ─────────────────────────────────────────────────────────────────────────────

export const getBeneficiaryPhone = async (
    tontineId: string,
    beneficiaryId: string
): Promise<{ phone: string | null; preferredMethod: DistributionMethod | null }> => {

    // 1. Chercher sur le doc membre (peut avoir un numéro spécifique à la tontine)
    const memberDoc = await db
        .collection('tontines').doc(tontineId)
        .collection('members').doc(beneficiaryId)
        .get();

    const memberData = memberDoc.data() ?? {};

    // Champ prioritaire : paymentPhone stocké lors de son dernier paiement
    if (memberData.paymentPhone) {
        return {
            phone: memberData.paymentPhone,
            preferredMethod: memberData.preferredPaymentMethod ?? null,
        };
    }

    // 2. Chercher sur le profil utilisateur global
    const userDoc = await db.collection('users').doc(beneficiaryId).get();
    const userData = userDoc.data() ?? {};

    return {
        phone: userData.phone ?? userData.phoneNumber ?? null,
        preferredMethod: userData.preferredPaymentMethod ?? null,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// MISE À JOUR DU NUMÉRO DE PAIEMENT DU MEMBRE
//
// Appelé après chaque paiement confirmé pour mémoriser le numéro utilisé.
// Permet de pré-remplir automatiquement lors de la distribution.
// ─────────────────────────────────────────────────────────────────────────────

export const saveMemberPaymentPhone = async (
    tontineId: string,
    userId: string,
    phone: string,
    method: string
): Promise<void> => {
    await db
        .collection('tontines').doc(tontineId)
        .collection('members').doc(userId)
        .update({
            paymentPhone: phone,
            preferredPaymentMethod: method,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
};

// ─────────────────────────────────────────────────────────────────────────────
// VÉRIFICATION DE LA COLLECTE D'UN TOUR
// ─────────────────────────────────────────────────────────────────────────────

export const getTurnCollectionStatus = async (
    tontineId: string,
    turnNumber: number
): Promise<TurnCollectionStatus> => {

    // 1. Récupérer tous les membres actifs
    const membersSnap = await db
        .collection('tontines').doc(tontineId)
        .collection('members')
        .where('status', '==', 'active')
        .get();

    const members = membersSnap.docs.map(doc => ({
        userId: doc.id,
        userName: doc.data().userName ?? null,
    }));

    // 2. Paiements confirmés pour ce tour
    const confirmedSnap = await db
        .collection('payments')
        .where('tontineId', '==', tontineId)
        .where('turnNumber', '==', turnNumber)
        .where('status', '==', 'confirmed')
        .get();

    const confirmedUserIds = new Set(confirmedSnap.docs.map(d => d.data().userId));
    const confirmedTotal = confirmedSnap.docs.reduce(
        (sum, d) => sum + (d.data().totalAmount ?? 0), 0
    );

    // 3. Paiements pending
    const pendingSnap = await db
        .collection('payments')
        .where('tontineId', '==', tontineId)
        .where('turnNumber', '==', turnNumber)
        .where('status', '==', 'pending')
        .get();

    const pendingUserIds = new Set(pendingSnap.docs.map(d => d.data().userId));

    // 4. Membres manquants
    const missingMembers = members
        .filter(m => !confirmedUserIds.has(m.userId))
        .map(m => ({
            userId: m.userId,
            userName: m.userName,
            status: (pendingUserIds.has(m.userId) ? 'pending' : 'unpaid') as 'pending' | 'unpaid',
        }));

    // 5. potPerTurn depuis la tontine
    const tontineDoc = await db.collection('tontines').doc(tontineId).get();
    const tontineData = tontineDoc.data()!;
    const potPerTurn = tontineData?.potPerTurn ?? 0;

    // BUG #1 FIX — Retourner aussi le numéro du bénéficiaire actuel
    const beneficiaryId: string = tontineData?.currentBeneficiaryUid ?? null;
    let beneficiaryPhone: string | null = null;
    let beneficiaryPreferredMethod: DistributionMethod | null = null;

    if (beneficiaryId) {
        const phoneResult = await getBeneficiaryPhone(tontineId, beneficiaryId);
        beneficiaryPhone = phoneResult.phone;
        beneficiaryPreferredMethod = phoneResult.preferredMethod;
    }

    return {
        tontineId,
        turnNumber,
        totalMembers: members.length,
        paidCount: confirmedUserIds.size,
        pendingCount: pendingUserIds.size,
        unpaidCount: missingMembers.filter(m => m.status === 'unpaid').length,
        isComplete: confirmedUserIds.size >= members.length && members.length > 0,
        totalCollected: confirmedTotal,
        expectedTotal: potPerTurn,
        missingMembers,
        // Nouveaux champs pour pré-remplir le formulaire de distribution
        beneficiaryId: beneficiaryId ?? null,
        beneficiaryPhone,
        beneficiaryPreferredMethod,
    };
};

export const checkAndTriggerDistribution = async (
    tontineId: string,
    turnNumber: number
): Promise<{ shouldDistribute: boolean; collectionStatus: TurnCollectionStatus }> => {
    const collectionStatus = await getTurnCollectionStatus(tontineId, turnNumber);
    return {
        shouldDistribute: collectionStatus.isComplete,
        collectionStatus,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// CRÉER LE DOCUMENT DISTRIBUTION
// ─────────────────────────────────────────────────────────────────────────────

export const createDistributionDoc = async (
    tontineId: string,
    turnNumber: number,
    beneficiaryId: string,
    beneficiaryName: string,
    amount: number,
    method: DistributionMethod,
    beneficiaryPhone: string,
    isPartial: boolean = false,
    sentAmount?: number,
): Promise<{ ref: admin.firestore.DocumentReference; data: Omit<Distribution, 'id'> }> => {

    const transactionId = generateDistributionTransactionId(method);
    const distRef = db
        .collection('tontines').doc(tontineId)
        .collection('distributions').doc();

    const simulatedStatus = simulateDistributionSend(method);

    const data: Omit<Distribution, 'id'> = {
        tontineId,
        beneficiaryId,
        beneficiaryName,
        turnNumber,
        amount,
        sentAmount: simulatedStatus === 'sent' ? amount : (sentAmount ?? 0),
        distributionMethod: method,
        beneficiaryPhone,
        transactionId,
        status: isPartial ? 'partial' : simulatedStatus,

        ...(simulatedStatus !== 'partial' && {
            distributedAt: admin.firestore.Timestamp.now(),
            
        }),

        ...(simulatedStatus === 'sent' && {
            receiptUrl: generateDistributionReceiptUrl(distRef.id),
        }),
        metadata: {
            simulationMode: true,
            isPartial,
            simulatedStatus,
            tontineName: '',
        },

        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    return { ref: distRef, data };
};

// ─────────────────────────────────────────────────────────────────────────────
// BUG #2 FIX — AVANCER AU TOUR SUIVANT
//
// Correction : mise à jour de nextPaymentDate selon la fréquence de la tontine,
// sinon les membres ne peuvent pas payer le tour suivant (la date reste
// celle du tour précédent → daysLate toujours négatif → pas de paiement possible)
// ─────────────────────────────────────────────────────────────────────────────

const computeNextPaymentDate = (
    frequency: string,
    paymentDay?: number | null
): admin.firestore.Timestamp => {
    const now = new Date();
    let next: Date;

    switch (frequency) {
        case 'daily':
            next = new Date(now);
            next.setDate(next.getDate() + 1);
            break;
        case 'weekly': {
            const daysUntil = ((paymentDay ?? 1) - now.getDay() + 7) % 7 || 7;
            next = new Date(now);
            next.setDate(next.getDate() + daysUntil);
            break;
        }
        case 'biweekly':
            next = new Date(now);
            next.setDate(next.getDate() + 14);
            break;
        case 'monthly':
        default:
            next = new Date(now.getFullYear(), now.getMonth() + 1, paymentDay ?? 1);
            break;
    }

    return admin.firestore.Timestamp.fromDate(next);
};

export const advanceToNextTurn = async (
    tontineId: string,
    transaction: admin.firestore.Transaction
): Promise<{
    nextTurn: number;
    nextBeneficiaryUid: string | null;
    tontineCompleted: boolean;
}> => {

    const tontineRef = db.collection('tontines').doc(tontineId);
    const tontineDoc = await tontineRef.get();

    if (!tontineDoc.exists) throw new Error('Tontine introuvable');
    const tontine = tontineDoc.data()!;

    const nextTurn = tontine.currentTurn + 1;
    const tontineCompleted = nextTurn > tontine.totalTurns;

    if (tontineCompleted) {
        transaction.update(tontineRef, {
            status: 'completed',
            endedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { nextTurn, nextBeneficiaryUid: null, tontineCompleted: true };
    }

    // BUG #2 FIX — Calculer la prochaine date de paiement pour le nouveau tour
    const nextPaymentDate = computeNextPaymentDate(
        tontine.frequency,
        tontine.paymentDay ?? null
    );

    const turnOrder: string[] = tontine.turnOrder ?? [];
    const nextBeneficiaryUid = turnOrder[nextTurn - 1] ?? null;

    if (!nextBeneficiaryUid) {
        // Rotation manuelle/consensuelle
        transaction.update(tontineRef, {
            currentTurn: nextTurn,
            nextPaymentDate,                    // ← FIX
            lastTurnStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { nextTurn, nextBeneficiaryUid: null, tontineCompleted: false };
    }

    transaction.update(tontineRef, {
        currentTurn: nextTurn,
        currentBeneficiaryUid: nextBeneficiaryUid,
        completedTurns: admin.firestore.FieldValue.arrayUnion(nextBeneficiaryUid),
        nextPaymentDate,                        // ← FIX : débloque les paiements du tour suivant
        lastTurnStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Marquer le nouveau bénéficiaire
    const nextMemberRef = db
        .collection('tontines').doc(tontineId)
        .collection('members').doc(nextBeneficiaryUid);

    transaction.update(nextMemberRef, {
        turnReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
        'stats.totalReceived': admin.firestore.FieldValue.increment(tontine.potPerTurn),
    });

    return { nextTurn, nextBeneficiaryUid, tontineCompleted: false };
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFIER TOUS LES MEMBRES
// ─────────────────────────────────────────────────────────────────────────────

export const notifyTurnDistributed = async (
    tontineId: string,
    tontineName: string,
    beneficiaryId: string,
    beneficiaryName: string,
    turnNumber: number,
    amount: number,
    nextBeneficiaryUid: string | null,
    transaction: admin.firestore.Transaction
): Promise<void> => {

    const membersSnap = await db
        .collection('tontines').doc(tontineId)
        .collection('members')
        .where('status', '==', 'active')
        .get();

    for (const m of membersSnap.docs) {
        const isBeneficiary = m.id === beneficiaryId;

        const notif = buildNotificationDoc(m.id, {
            title: isBeneficiary
                ? `🎉 Vous avez reçu ${new Intl.NumberFormat('fr-FR').format(amount)} FCFA !`
                : `Tour ${turnNumber} distribué`,
            body: isBeneficiary
                ? `La tontine ${tontineName} vous a versé votre pot`
                : `${beneficiaryName} a reçu son pot pour le tour ${turnNumber}`,
            type: isBeneficiary ? 'distribution_received' : 'distribution_sent',
            tontineId,
            tontineName,
            turnNumber,
            amount,
            beneficiaryId,
            beneficiaryName,
        });

        transaction.set(notif.ref, notif.data);
    }

    if (nextBeneficiaryUid && nextBeneficiaryUid !== beneficiaryId) {
        const nextNotif = buildNotificationDoc(nextBeneficiaryUid, {
            title: '🔔 Prochain bénéficiaire',
            body: `Vous êtes le prochain à recevoir votre pot dans ${tontineName}`,
            type: 'next_beneficiary',
            tontineId,
            tontineName,
        });
        transaction.set(nextNotif.ref, nextNotif.data);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// VÉRIFIER SI UNE DISTRIBUTION EXISTE DÉJÀ
// ─────────────────────────────────────────────────────────────────────────────

export const hasExistingDistribution = async (
    tontineId: string,
    turnNumber: number
): Promise<boolean> => {
    const snap = await db
        .collection('tontines').doc(tontineId)
        .collection('distributions')
        .where('turnNumber', '==', turnNumber)
        .where('status', 'in', ['pending', 'sent', 'received'])
        .limit(1)
        .get();

    return !snap.empty;
};