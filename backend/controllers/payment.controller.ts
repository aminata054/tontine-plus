import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import {
    computePenalty,
    computeDaysLate,
    generateTransactionId,
    generateReceiptNumber,
    generateReceiptUrl,
    simulateOperatorVerification,
    hasAlreadyPaidTurn,
    SIMULATION_CONFIG,
} from '../services/payment.service';
import { buildNotificationDoc, sendNotificationToUser } from '../services/notification.service';
import { InitiatePaymentPayload, PaymentMethod, VerifyPaymentPayload } from '../types/payment.type';
import { checkAndTriggerDistribution } from '../services/distribution.service';
import {  applyContributionWrite, readWalletSnapshot } from '../services/wallet.service';

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION — méthodes de paiement acceptées
// ─────────────────────────────────────────────────────────────────────────────
const VALID_METHODS: PaymentMethod[] = ['wave', 'orange', 'kpay', 'manual'];

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/payments/initiate
//
// Crée un document Payment en statut 'pending'.
// Pour la simulation, déclenche une vérification automatique après le délai
// propre à chaque méthode. Pour la vraie intégration, on retournera
// une redirectUrl vers Wave/Orange et on attendra le webhook.
//
// Body : { tontineId, paymentMethod, paymentMethodNumber, turnNumber? }
// ─────────────────────────────────────────────────────────────────────────────
export const initiatePayment = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const {
        tontineId,
        paymentMethod,
        paymentMethodNumber,
        turnNumber: reqTurnNumber,
    } = req.body as InitiatePaymentPayload;

    // ── Validation ────────────────────────────────────────────────────────────
    const errors: string[] = [];

    if (!tontineId) errors.push('tontineId requis');
    if (!paymentMethod || !VALID_METHODS.includes(paymentMethod))
        errors.push(`paymentMethod invalide — valeurs acceptées : ${VALID_METHODS.join(' | ')}`);
    if (!paymentMethodNumber || paymentMethodNumber.trim().length < 6)
        errors.push('paymentMethodNumber requis (minimum 6 caractères)');

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    try {
        // ── Récupérer la tontine ───────────────────────────────────────────────
        const tontineDoc = await db.collection('tontines').doc(tontineId).get();
        if (!tontineDoc.exists)
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });

        const tontine = tontineDoc.data()!;

        // ── Vérifier le statut de la tontine ──────────────────────────────────
        if (tontine.status !== 'active')
            return res.status(400).json({
                success: false,
                error: 'Les paiements ne sont acceptés que pour les tontines actives',
            });

        // ── Vérifier que l'utilisateur est un membre actif ────────────────────
        const memberDoc = await db
            .collection('tontines').doc(tontineId)
            .collection('members').doc(uid)
            .get();

        if (!memberDoc.exists || memberDoc.data()?.status !== 'active')
            return res.status(403).json({
                success: false,
                error: 'Vous devez être un membre actif pour effectuer un paiement',
            });

        const memberData = memberDoc.data()!;
        const turnNumber = reqTurnNumber ?? tontine.currentTurn;

        // ── Vérifier qu'il n'a pas déjà payé ce tour ──────────────────────────
        const alreadyPaid = await hasAlreadyPaidTurn(tontineId, uid, turnNumber);
        if (alreadyPaid)
            return res.status(400).json({
                success: false,
                error: `Vous avez déjà effectué un paiement pour le tour ${turnNumber}`,
            });

        // ── Calculer la pénalité éventuelle ───────────────────────────────────
        const daysLate = computeDaysLate(tontine.nextPaymentDate);
        const gracePeriod = tontine.rules?.gracePeriodDays ?? 0;
        const penaltyType = tontine.rules?.penaltyType ?? 'percentage';
        const penaltyValue = tontine.rules?.penaltyValue ?? 0;

        const penaltyAmount = computePenalty(
            tontine.amount,
            penaltyType,
            penaltyValue,
            daysLate,
            gracePeriod
        );

        const totalAmount = tontine.amount + penaltyAmount;
        const transactionId = generateTransactionId(paymentMethod);
        const simulationConfig = SIMULATION_CONFIG[paymentMethod];

        // ── Créer le document Payment ──────────────────────────────────────────
        const paymentRef = db.collection('payments').doc();
        const paymentId = paymentRef.id;

        const paymentDoc = {
            id: paymentId,
            tontineId,
            userId: uid,
            userName: memberData.userName ?? null,
            turnNumber,
            amount: tontine.amount,
            penaltyAmount,
            totalAmount,
            paymentMethod,
            paymentMethodNumber: paymentMethodNumber.trim(),
            transactionId,
            status: 'pending',
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            confirmedAt: null,
            failedAt: null,
            receiptUrl: null,
            metadata: {
                daysLate,
                gracePeriod,
                simulationMode: true,
                simulationDelayMs: simulationConfig.delayMs,
                tontineName: tontine.name,
                potPerTurn: tontine.potPerTurn,
            },
            // Champs spécifiques au paiement manuel
            verificationStatus: paymentMethod === 'manual' ? 'pending' : null,
            verifiedBy: null,
            verifiedAt: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await paymentRef.set(paymentDoc);

        // ── Pour les paiements non-manuels : simulation asynchrone ────────────
        // Dans la vraie intégration : on écoutera le webhook de l'opérateur
        // En mode simulation : on planifie une vérification automatique via
        // un délai (déclenché côté client avec /payments/verify après le délai)

        return res.status(201).json({
            success: true,
            message: simulationConfig.pendingMessage,
            data: {
                paymentId,
                transactionId,
                amount: tontine.amount,
                penaltyAmount,
                totalAmount,
                status: 'pending',
                paymentMethod,
                // Simulation : délai avant que le client appelle /verify
                simulationDelayMs: simulationConfig.delayMs,
                // Vrai webhook : redirectUrl serait ici
                redirectUrl: null,
                daysLate,
                gracePeriod,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/payments/verify
//
// Vérifie le statut d'un paiement et le confirme ou l'échoue.
// En simulation : simule la réponse de l'opérateur mobile money.
// En production : appellera l'API Wave/Orange pour vérifier le transactionId.
//
// Body : { paymentId, transactionId? }
// ─────────────────────────────────────────────────────────────────────────────
export const verifyPayment = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { paymentId } = req.body as VerifyPaymentPayload;

    if (!paymentId)
        return res.status(400).json({ success: false, error: 'paymentId requis' });

    try {
        const paymentRef = db.collection('payments').doc(paymentId);
        const paymentDoc = await paymentRef.get();

        if (!paymentDoc.exists)
            return res.status(404).json({ success: false, error: 'Paiement introuvable' });

        const payment = paymentDoc.data()!;

        if (payment.userId !== uid)
            return res.status(403).json({ success: false, error: 'Accès refusé' });

        if (payment.status !== 'pending')
            return res.status(400).json({ success: false, error: `Ce paiement est déjà ${payment.status}`, data: { paymentId, status: payment.status } });

        if (payment.paymentMethod === 'manual') {
            return res.json({
                success: true,
                message: 'Paiement manuel en attente de vérification par le créateur',
                data: { paymentId, status: 'pending', verificationStatus: 'pending', memberStatsUpdated: false, collectionStatus: null },
            });
        }

        const simulatedStatus = simulateOperatorVerification(payment.paymentMethod);
        const isLate = (payment.metadata?.daysLate ?? 0) > (payment.metadata?.gracePeriod ?? 0);
        const tontineId = payment.tontineId;
        let memberStatsUpdated = false;
        let receiptUrl: string | null = null;

        // ── FIX : tous les READS avant la transaction ─────────────────────────
        // On lit le wallet snapshot et le nombre de membres actifs ici,
        // AVANT d'ouvrir db.runTransaction(), pour ne pas mélanger reads/writes.
        let walletSnapshot: Awaited<ReturnType<typeof readWalletSnapshot>> | null = null;

        if (simulatedStatus === 'confirmed') {
            // Read 1 : snapshot du wallet
            walletSnapshot = await readWalletSnapshot(tontineId);

            // Read 2 : nombre de membres actifs (pour calculer targetAmount si wallet pas init)
            // Uniquement utile si le wallet n'existe pas encore (premier paiement du tour)
            if (!walletSnapshot.exists || walletSnapshot.targetAmount === 0) {
                const activeMembersSnap = await db
                    .collection('tontines').doc(tontineId)
                    .collection('members')
                    .where('status', '==', 'active')
                    .get();

                // Patcher le snapshot avec le bon targetAmount avant de l'utiliser dans la tx
                const tontineSnap = await db.collection('tontines').doc(tontineId).get();
                walletSnapshot.targetAmount = (tontineSnap.data()?.amount ?? 0) * activeMembersSnap.size;
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        await db.runTransaction(async (transaction) => {
            // À partir d'ici : UNIQUEMENT des writes dans cette transaction
            if (simulatedStatus === 'confirmed') {
                receiptUrl = generateReceiptUrl(paymentId);

                transaction.update(paymentRef, {
                    status: 'confirmed',
                    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
                    receiptUrl,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                const memberRef = db.collection('tontines').doc(tontineId).collection('members').doc(uid);
                transaction.update(memberRef, {
                    'stats.totalPaid': admin.firestore.FieldValue.increment(payment.totalAmount),
                    [`stats.${isLate ? 'latePayments' : 'onTimePayments'}`]: admin.firestore.FieldValue.increment(1),
                });

                if (payment.paymentMethodNumber && payment.paymentMethod !== 'manual') {
                    transaction.update(memberRef, {
                        paymentPhone: payment.paymentMethodNumber,
                        preferredPaymentMethod: payment.paymentMethod,
                    });
                }

                const tontineRef = db.collection('tontines').doc(tontineId);
                transaction.update(tontineRef, {
                    'stats.totalCollected': admin.firestore.FieldValue.increment(payment.totalAmount),
                });

                // Write wallet : utilise le snapshot pré-lu, pas de read dans la transaction
                applyContributionWrite(transaction, walletSnapshot!, {
                    userId: uid,
                    userName: payment.userName ?? 'Membre',
                    amount: payment.totalAmount,
                    paidAt: admin.firestore.Timestamp.now(),
                    turnNumber: payment.turnNumber,
                }, tontineId);

                memberStatsUpdated = true;

                const notif = buildNotificationDoc(uid, {
                    title: 'Paiement confirmé',
                    body: `Votre cotisation de ${payment.totalAmount} FCFA a été confirmée pour ${payment.metadata?.tontineName}`,
                    type: 'payment_confirmed',
                    tontineId,
                    tontineName: payment.metadata?.tontineName,
                    paymentId,
                    amount: payment.totalAmount,
                });
                transaction.set(notif.ref, notif.data);

            } else {
                transaction.update(paymentRef, {
                    status: 'failed',
                    failedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                const notif = buildNotificationDoc(uid, {
                    title: 'Paiement échoué',
                    body: `Votre paiement de ${payment.totalAmount} FCFA a échoué. Veuillez réessayer.`,
                    type: 'payment_failed',
                    tontineId,
                    tontineName: payment.metadata?.tontineName,
                    paymentId,
                });
                transaction.set(notif.ref, notif.data);
            }
        });

        // Hook post-confirmation (hors transaction — inchangé)
        let collectionStatus = null;
        let distributionReady = false;

        if (simulatedStatus === 'confirmed') {
            try {
                const { shouldDistribute, collectionStatus: cs } =
                    await checkAndTriggerDistribution(tontineId, payment.turnNumber);
                collectionStatus = cs;
                distributionReady = shouldDistribute;

                if (shouldDistribute) {
                    const tontineDoc = await db.collection('tontines').doc(tontineId).get();
                    const tontine = tontineDoc.data()!;
                    const creatorNotif = buildNotificationDoc(tontine.createdBy, {
                        title: '💰 Collecte complète !',
                        body: `Tous les membres ont payé le tour ${payment.turnNumber} de ${tontine.name}. Vous pouvez distribuer le pot.`,
                        type: 'collection_complete',
                        tontineId, tontineName: tontine.name,
                        turnNumber: payment.turnNumber, amount: tontine.potPerTurn,
                    });
                    await db.runTransaction(async (t) => { t.set(creatorNotif.ref, creatorNotif.data); });
                    await sendNotificationToUser(tontine.createdBy, creatorNotif.data);
                }
            } catch (hookErr) {
                console.error('[verifyPayment] Hook post-confirmation error:', hookErr);
            }

            await sendNotificationToUser(uid, {
                title: 'Paiement confirmé',
                body: `Votre cotisation de ${payment.totalAmount} FCFA a été confirmée`,
                type: 'payment_confirmed', tontineId, paymentId,
            });
        }

        return res.json({
            success: true,
            message: simulatedStatus === 'confirmed' ? 'Paiement confirmé avec succès' : 'Paiement échoué — veuillez réessayer',
            data: { paymentId, status: simulatedStatus, confirmedAt: simulatedStatus === 'confirmed' ? new Date().toISOString() : null, receiptUrl, memberStatsUpdated, collectionStatus, distributionReady },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/payments/:paymentId/manual-verify
//
// Permet au créateur / admin de valider ou rejeter un paiement manuel.
// Body : { action: 'verify' | 'reject', reason?: string }
// ─────────────────────────────────────────────────────────────────────────────
export const manualVerifyPayment = async (req: Request, res: Response) => {
    const callerUid = (req as any).user.uid;
    const { paymentId } = req.params;
    const { action, reason } = req.body as { action: 'verify' | 'reject'; reason?: string };

    if (!['verify', 'reject'].includes(action))
        return res.status(400).json({ success: false, error: 'action invalide — verify | reject' });

    if (!paymentId || typeof paymentId !== 'string')
        return res.status(400).json({ success: false, error: 'paymentId requis' });

    try {
        const paymentRef = db.collection('payments').doc(paymentId);
        const paymentDoc = await paymentRef.get();

        if (!paymentDoc.exists)
            return res.status(404).json({ success: false, error: 'Paiement introuvable' });

        const payment = paymentDoc.data()!;

        if (payment.paymentMethod !== 'manual')
            return res.status(400).json({
                success: false,
                error: 'Seuls les paiements manuels nécessitent une vérification',
            });

        if (payment.verificationStatus !== 'pending')
            return res.status(400).json({
                success: false,
                error: `Ce paiement a déjà été traité (${payment.verificationStatus})`,
            });

        // Vérifier que le caller est créateur ou admin de la tontine
        const callerDoc = await db
            .collection('tontines').doc(payment.tontineId)
            .collection('members').doc(callerUid)
            .get();

        if (!callerDoc.exists || !['creator', 'admin'].includes(callerDoc.data()?.role))
            return res.status(403).json({ success: false, error: 'Accès refusé' });

        const isLate = (payment.metadata?.daysLate ?? 0) > (payment.metadata?.gracePeriod ?? 0);

        await db.runTransaction(async (transaction) => {
            if (action === 'verify') {
                const receiptUrl = generateReceiptUrl(paymentId);

                transaction.update(paymentRef, {
                    status: 'confirmed',
                    verificationStatus: 'verified',
                    verifiedBy: callerUid,
                    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
                    receiptUrl,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Stats membre
                const memberRef = db
                    .collection('tontines').doc(payment.tontineId)
                    .collection('members').doc(payment.userId);

                transaction.update(memberRef, {
                    'stats.totalPaid': admin.firestore.FieldValue.increment(payment.totalAmount),
                    [`stats.${isLate ? 'latePayments' : 'onTimePayments'}`]:
                        admin.firestore.FieldValue.increment(1),
                });

                // Stats tontine
                const tontineRef = db.collection('tontines').doc(payment.tontineId);
                transaction.update(tontineRef, {
                    'stats.totalCollected': admin.firestore.FieldValue.increment(payment.totalAmount),
                });

                // Notifier le payeur
                const notif = buildNotificationDoc(payment.userId, {
                    title: 'Paiement validé ✅',
                    body: `Votre paiement manuel de ${payment.totalAmount} FCFA a été validé`,
                    type: 'payment_confirmed',
                    tontineId: payment.tontineId,
                    paymentId,
                });
                transaction.set(notif.ref, notif.data);

            } else {
                transaction.update(paymentRef, {
                    status: 'failed',
                    verificationStatus: 'rejected',
                    verifiedBy: callerUid,
                    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                    failedAt: admin.firestore.FieldValue.serverTimestamp(),
                    metadata: { ...payment.metadata, rejectionReason: reason ?? null },
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                const notif = buildNotificationDoc(payment.userId, {
                    title: 'Paiement refusé ❌',
                    body: reason
                        ? `Votre paiement a été refusé : ${reason}`
                        : 'Votre paiement manuel a été refusé',
                    type: 'payment_failed',
                    tontineId: payment.tontineId,
                    paymentId,
                });
                transaction.set(notif.ref, notif.data);
            }
        });

        return res.json({
            success: true,
            message: action === 'verify' ? 'Paiement validé avec succès' : 'Paiement refusé',
            data: {
                paymentId,
                status: action === 'verify' ? 'confirmed' : 'failed',
                verificationStatus: action === 'verify' ? 'verified' : 'rejected',
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/payments/:paymentId/receipt
//
// Retourne les données complètes du reçu d'un paiement confirmé.
// ─────────────────────────────────────────────────────────────────────────────
export const getPaymentReceipt = async (
    req: Request<{ paymentId: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { paymentId } = req.params;

    if (!paymentId)
        return res.status(400).json({ success: false, error: 'paymentId requis' });

    try {
        const paymentDoc = await db.collection('payments').doc(paymentId).get();

        if (!paymentDoc.exists)
            return res.status(404).json({ success: false, error: 'Paiement introuvable' });

        const payment = paymentDoc.data()!;

        // Vérifier que l'utilisateur est le payeur ou un admin/créateur de la tontine
        const isOwner = payment.userId === uid;
        let isAdmin = false;

        if (!isOwner) {
            const callerDoc = await db
                .collection('tontines').doc(payment.tontineId)
                .collection('members').doc(uid)
                .get();
            isAdmin = callerDoc.exists && ['creator', 'admin'].includes(callerDoc.data()?.role);
        }

        if (!isOwner && !isAdmin)
            return res.status(403).json({ success: false, error: 'Accès refusé' });

        if (payment.status !== 'confirmed')
            return res.status(400).json({
                success: false,
                error: 'Le reçu n\'est disponible que pour les paiements confirmés',
            });

        // Récupérer le nom de la tontine
        const tontineDoc = await db.collection('tontines').doc(payment.tontineId).get();
        const tontineName = tontineDoc.data()?.name ?? 'Tontine';

        const receiptNumber = generateReceiptNumber(paymentId);

        return res.json({
            success: true,
            data: {
                payment: { id: paymentDoc.id, ...payment },
                tontineName,
                receiptNumber,
                generatedAt: new Date().toISOString(),
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/payments?tontineId=...
//
// Retourne l'historique des paiements de l'utilisateur dans une tontine.
// ─────────────────────────────────────────────────────────────────────────────
export const getMyPayments = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { tontineId } = req.query as { tontineId?: string };

    try {
        let query = db.collection('payments').where('userId', '==', uid);

        if (tontineId) {
            query = query.where('tontineId', '==', tontineId) as any;
        }

        const snap = await query.orderBy('createdAt', 'desc').limit(50).get();
        const payments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return res.json({ success: true, data: payments, count: payments.length });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};