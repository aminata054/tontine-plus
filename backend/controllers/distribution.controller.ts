import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import {
    getTurnCollectionStatus,
    checkAndTriggerDistribution,
    createDistributionDoc,
    advanceToNextTurn,
    notifyTurnDistributed,
    hasExistingDistribution,
    DISTRIBUTION_SIM_CONFIG,
    generateDistributionReceiptUrl,
} from '../services/distribution.service';
import { buildNotificationDoc, sendNotificationToUser } from '../services/notification.service';
import {
    DistributionMethod,
    TriggerDistributionPayload,
    ConfirmDistributionPayload,
} from '../types/distribution.type';

const VALID_DIST_METHODS: DistributionMethod[] = ['wave', 'orange', 'free', 'manual'];

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/distributions/turn-status?tontineId=...&turnNumber=...
//
// Retourne l'état de collecte du tour courant :
// combien de membres ont payé, lesquels manquent, montant collecté, etc.
// ─────────────────────────────────────────────────────────────────────────────
export const getTurnStatus = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { tontineId, turnNumber } = req.query as {
        tontineId?: string;
        turnNumber?: string;
    };

    if (!tontineId)
        return res.status(400).json({ success: false, error: 'tontineId requis' });

    try {
        // Vérifier que l'appelant est membre de la tontine
        const callerDoc = await db
            .collection('tontines').doc(tontineId)
            .collection('members').doc(uid).get();

        if (!callerDoc.exists)
            return res.status(403).json({ success: false, error: 'Accès refusé' });

        const tontineDoc = await db.collection('tontines').doc(tontineId).get();
        if (!tontineDoc.exists)
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });

        const tontine = tontineDoc.data()!;
        const turn = turnNumber ? parseInt(turnNumber) : tontine.currentTurn;

        const collectionStatus = await getTurnCollectionStatus(tontineId, turn);

        return res.json({
            success: true,
            data: collectionStatus,
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/distributions/trigger
//
// Déclenche la distribution du pot du tour courant au bénéficiaire.
// Conditions :
//   - Tontine active, caller = créateur ou admin
//   - Collecte complète (tous les membres ont payé) OU forcePartial=true
//   - Pas de distribution déjà créée pour ce tour
//
// Flow :
//   1. Vérifier la collecte
//   2. Créer le doc Distribution (status: 'sent' simulé)
//   3. Notifier le bénéficiaire + tous les membres
//   4. Le tour suivant est avancé dans /distributions/confirm
//      (après que le bénéficiaire ait confirmé réception)
// ─────────────────────────────────────────────────────────────────────────────
export const triggerDistribution = async (req: Request, res: Response) => {
    const callerUid = (req as any).user.uid;
    const {
        tontineId,
        distributionMethod,
        beneficiaryPhone,
        forcePartial = false,
    } = req.body as TriggerDistributionPayload;

    // ── Validation ────────────────────────────────────────────────────────────
    const errors: string[] = [];

    if (!tontineId) errors.push('tontineId requis');
    if (!distributionMethod || !VALID_DIST_METHODS.includes(distributionMethod))
        errors.push(`distributionMethod invalide — valeurs : ${VALID_DIST_METHODS.join(' | ')}`);
    if (!beneficiaryPhone || beneficiaryPhone.trim().length < 6)
        errors.push('beneficiaryPhone requis (minimum 6 caractères)');

    if (errors.length > 0)
        return res.status(400).json({ success: false, errors });

    try {
        // ── Récupérer la tontine ───────────────────────────────────────────────
        const tontineRef = db.collection('tontines').doc(tontineId);
        const tontineDoc = await tontineRef.get();

        if (!tontineDoc.exists)
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });

        const tontine = tontineDoc.data()!;

        // ── Vérifier les droits ───────────────────────────────────────────────
        const callerDoc = await db
            .collection('tontines').doc(tontineId)
            .collection('members').doc(callerUid).get();

        if (!callerDoc.exists || !['creator', 'admin'].includes(callerDoc.data()?.role))
            return res.status(403).json({
                success: false,
                error: 'Seul le créateur ou un admin peut déclencher une distribution',
            });

        if (tontine.status !== 'active')
            return res.status(400).json({
                success: false,
                error: 'La tontine doit être active pour effectuer une distribution',
            });

        const currentTurn: number = tontine.currentTurn;

        if (currentTurn === 0)
            return res.status(400).json({
                success: false,
                error: 'Aucun tour actif — lancez la tontine d\'abord',
            });

        // ── Vérifier qu'il n'y a pas déjà une distribution pour ce tour ───────
        const alreadyExists = await hasExistingDistribution(tontineId, currentTurn);
        if (alreadyExists)
            return res.status(400).json({
                success: false,
                error: `Une distribution existe déjà pour le tour ${currentTurn}`,
            });

        // ── Vérifier la collecte ──────────────────────────────────────────────
        const { shouldDistribute, collectionStatus } = await checkAndTriggerDistribution(
            tontineId, currentTurn
        );

        if (!shouldDistribute && !forcePartial) {
            return res.status(400).json({
                success: false,
                error: `Collecte incomplète — ${collectionStatus.paidCount}/${collectionStatus.totalMembers} membres ont payé`,
                data: {
                    collectionStatus,
                    hint: 'Utilisez forcePartial=true pour forcer une distribution partielle (admin)',
                },
            });
        }

        // ── Récupérer le bénéficiaire actuel ──────────────────────────────────
        const beneficiaryId: string = tontine.currentBeneficiaryUid;
        if (!beneficiaryId)
            return res.status(400).json({
                success: false,
                error: 'Aucun bénéficiaire défini pour ce tour',
            });

        const beneficiaryMemberDoc = await db
            .collection('tontines').doc(tontineId)
            .collection('members').doc(beneficiaryId).get();

        const beneficiaryName: string =
            beneficiaryMemberDoc.data()?.userName ?? 'Membre';

        const amountToSend = forcePartial && !shouldDistribute
            ? collectionStatus.totalCollected   // distribuer ce qui a été collecté
            : tontine.potPerTurn;               // distribuer le pot complet

        // ── Créer et simuler la distribution ──────────────────────────────────
        const simConfig = DISTRIBUTION_SIM_CONFIG[distributionMethod];
        const { ref: distRef, data: distData } = await createDistributionDoc(
            tontineId,
            currentTurn,
            beneficiaryId,
            beneficiaryName,
            amountToSend,
            distributionMethod,
            beneficiaryPhone.trim(),
            forcePartial && !shouldDistribute,
            collectionStatus.totalCollected,
        );

        // Compléter les metadata avec le nom de la tontine
        const finalDistData = {
            ...distData,
            metadata: {
                ...distData.metadata,
                tontineName: tontine.name,
                collectionStatus: {
                    paidCount: collectionStatus.paidCount,
                    totalMembers: collectionStatus.totalMembers,
                    wasComplete: shouldDistribute,
                },
                triggeredBy: callerUid,
            },
        };

        await db.runTransaction(async (transaction) => {
            // 1. Écrire le document distribution
            transaction.set(distRef, { id: distRef.id, ...finalDistData });

            // 2. Mettre à jour le statut de la tontine — distribution en cours
            transaction.update(tontineRef, {
                currentDistributionId: distRef.id,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 3. Notifier tous les membres
            const membersSnap = await db
                .collection('tontines').doc(tontineId)
                .collection('members')
                .where('status', '==', 'active')
                .get();

            for (const m of membersSnap.docs) {
                const isBeneficiary = m.id === beneficiaryId;

                const notif = buildNotificationDoc(m.id, {
                    title: isBeneficiary
                        ? '🎉 Votre pot est en route !'
                        : `Tour ${currentTurn} — distribution lancée`,
                    body: isBeneficiary
                        ? `${new Intl.NumberFormat('fr-FR').format(amountToSend)} FCFA envoyés sur votre ${distributionMethod}`
                        : `${beneficiaryName} reçoit ${new Intl.NumberFormat('fr-FR').format(amountToSend)} FCFA`,
                    type: isBeneficiary ? 'distribution_sent_to_you' : 'distribution_sent',
                    tontineId,
                    tontineName: tontine.name,
                    turnNumber: currentTurn,
                    distributionId: distRef.id,
                    amount: amountToSend,
                });
                transaction.set(notif.ref, notif.data);
            }
        });

        // Push notifications hors transaction
        await sendNotificationToUser(beneficiaryId, {
            title: '🎉 Votre pot est en route !',
            body: `${new Intl.NumberFormat('fr-FR').format(amountToSend)} FCFA envoyés via ${distributionMethod}`,
            type: 'distribution_sent_to_you',
            tontineId,
            distributionId: distRef.id,
        });

        return res.status(201).json({
            success: true,
            message: finalDistData.status === 'sent'
                ? `Distribution de ${new Intl.NumberFormat('fr-FR').format(amountToSend)} FCFA lancée avec succès`
                : `Distribution partielle de ${new Intl.NumberFormat('fr-FR').format(amountToSend)} FCFA enregistrée`,
            data: {
                distributionId: distRef.id,
                transactionId: finalDistData.transactionId!,
                beneficiaryId,
                beneficiaryName,
                amount: amountToSend,
                status: finalDistData.status,
                // Délai de simulation : le client appellera /confirm après ce délai
                simulationDelayMs: simConfig.delayMs,
                nextTurnStarted: false, // démarré dans /confirm
                tontineCompleted: false,
                collectionStatus,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/distributions/confirm
//
// Le bénéficiaire (ou le système) confirme la réception du pot.
// Déclenche alors l'avancement au tour suivant.
//
// Body : { distributionId, tontineId, transactionId? }
// ─────────────────────────────────────────────────────────────────────────────
export const confirmDistribution = async (req: Request, res: Response) => {
    const callerUid = (req as any).user.uid;
    const { distributionId, tontineId, transactionId } = req.body as ConfirmDistributionPayload;

    if (!distributionId)
        return res.status(400).json({ success: false, error: 'distributionId requis' });
    if (!tontineId)
        return res.status(400).json({ success: false, error: 'tontineId requis' });

    try {
        const distRef = db
            .collection('tontines').doc(tontineId)
            .collection('distributions').doc(distributionId);

        const distDoc = await distRef.get();

        if (!distDoc.exists)
            return res.status(404).json({ success: false, error: 'Distribution introuvable' });

        const dist = distDoc.data()!;

        // ── Vérifier les droits ───────────────────────────────────────────────
        // Peut confirmer : le bénéficiaire lui-même OU créateur/admin
        const callerMemberDoc = await db
            .collection('tontines').doc(tontineId)
            .collection('members').doc(callerUid).get();

        const callerRole = callerMemberDoc.data()?.role ?? 'member';
        const isBeneficiary = dist.beneficiaryId === callerUid;
        const isAdminOrCreator = ['creator', 'admin'].includes(callerRole);

        if (!isBeneficiary && !isAdminOrCreator)
            return res.status(403).json({
                success: false,
                error: 'Seul le bénéficiaire, le créateur ou un admin peut confirmer la réception',
            });

        if (!['sent', 'partial'].includes(dist.status))
            return res.status(400).json({
                success: false,
                error: `Impossible de confirmer une distribution avec le statut "${dist.status}"`,
            });

        const tontineDoc = await db.collection('tontines').doc(tontineId).get();
        const tontine = tontineDoc.data()!;
        const receiptUrl = generateDistributionReceiptUrl(distributionId);

        // ── Transaction : confirmer + avancer au tour suivant ─────────────────
        let nextTurnResult: {
            nextTurn: number;
            nextBeneficiaryUid: string | null;
            tontineCompleted: boolean;
        };

        await db.runTransaction(async (transaction) => {
            // 1. Confirmer la distribution
            transaction.update(distRef, {
                status: 'received',
                confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
                receiptUrl,
                ...(transactionId ? { transactionId } : {}),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 2. Avancer au tour suivant
            nextTurnResult = await advanceToNextTurn(tontineId, transaction);

            // 3. Notifier tous les membres
            await notifyTurnDistributed(
                tontineId,
                tontine.name,
                dist.beneficiaryId,
                dist.beneficiaryName,
                dist.turnNumber,
                dist.amount,
                nextTurnResult!.nextBeneficiaryUid,
                transaction
            );

            // 4. Si tontine terminée : notifier la fin
            if (nextTurnResult!.tontineCompleted) {
                const membersSnap = await db
                    .collection('tontines').doc(tontineId)
                    .collection('members')
                    .where('status', '==', 'active')
                    .get();

                for (const m of membersSnap.docs) {
                    const endNotif = buildNotificationDoc(m.id, {
                        title: '🏁 Tontine terminée !',
                        body: `La tontine ${tontine.name} est arrivée à son terme. Félicitations à tous !`,
                        type: 'tontine_completed',
                        tontineId,
                        tontineName: tontine.name,
                    });
                    transaction.set(endNotif.ref, endNotif.data);
                }
            }
        });

        return res.json({
            success: true,
            message: nextTurnResult!.tontineCompleted
                ? '🏁 Distribution confirmée — la tontine est maintenant terminée !'
                : `Distribution confirmée — Tour ${nextTurnResult!.nextTurn} démarré`,
            data: {
                distributionId,
                status: 'received',
                confirmedAt: new Date().toISOString(),
                receiptUrl,
                nextTurnNumber: nextTurnResult!.tontineCompleted
                    ? null
                    : nextTurnResult!.nextTurn,
                nextBeneficiaryUid: nextTurnResult!.nextBeneficiaryUid,
                tontineCompleted: nextTurnResult!.tontineCompleted,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/distributions/:distributionId?tontineId=...
//
// Détails d'une distribution.
// ─────────────────────────────────────────────────────────────────────────────
export const getDistribution = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { distributionId } = req.params;
    const { tontineId } = req.query as { tontineId?: string };

    if (!tontineId)
        return res.status(400).json({ success: false, error: 'tontineId requis (query param)' });

    if (!distributionId || Array.isArray(distributionId)) {
        return res.status(400).json({
            success: false,
            error: 'distributionId invalide',
        });
    }

    try {
        // Vérifier l'accès
        const callerDoc = await db
            .collection('tontines').doc(tontineId)
            .collection('members').doc(uid).get();

        if (!callerDoc.exists)
            return res.status(403).json({ success: false, error: 'Accès refusé' });

        const distDoc = await db
            .collection('tontines').doc(tontineId)
            .collection('distributions').doc(distributionId).get();

        if (!distDoc.exists)
            return res.status(404).json({ success: false, error: 'Distribution introuvable' });

        return res.json({
            success: true,
            data: { id: distDoc.id, ...distDoc.data() },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/distributions?tontineId=...
//
// Historique de toutes les distributions d'une tontine.
// ─────────────────────────────────────────────────────────────────────────────
export const getDistributionsByTontine = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { tontineId } = req.query as { tontineId?: string };

    if (!tontineId)
        return res.status(400).json({ success: false, error: 'tontineId requis' });

    try {
        const callerDoc = await db
            .collection('tontines').doc(tontineId)
            .collection('members').doc(uid).get();

        if (!callerDoc.exists)
            return res.status(403).json({ success: false, error: 'Accès refusé' });

        const snap = await db
            .collection('tontines').doc(tontineId)
            .collection('distributions')
            .orderBy('turnNumber', 'desc')
            .get();

        const distributions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        return res.json({
            success: true,
            data: distributions,
            count: distributions.length,
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};