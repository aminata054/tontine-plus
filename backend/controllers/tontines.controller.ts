import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';

// ─────────────────────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────────────────────

const generateInviteCode = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join('');
};

const getNextPaymentDate = (frequency: string, paymentDay?: number): Date => {
    const now = new Date();
    switch (frequency) {
        case 'daily':
            return new Date(now.setDate(now.getDate() + 1));
        case 'weekly':
            const daysUntil = ((paymentDay ?? 1) - now.getDay() + 7) % 7 || 7;
            return new Date(now.setDate(now.getDate() + daysUntil));
        case 'biweekly':
            return new Date(now.setDate(now.getDate() + 14));
        case 'monthly':
        default:
            return new Date(now.getFullYear(), now.getMonth() + 1, paymentDay ?? 1);
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/tontines — CRÉER UNE TONTINE
//
// Changement clé : on écrit `tontineId` dans users/{uid}.tontineIds[]
// via arrayUnion — plus besoin de collectionGroup sur members/
// ─────────────────────────────────────────────────────────────
export const createTontine = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    const {
        type,
        name,
        description,
        iconUrl,
        visibility,
        amount,
        frequency,
        paymentDay,
        totalMembers,
        rotationMethod,
        gracePeriodDays,
        penaltyType,
        penaltyValue,
        autoExclusionDays,
        earlyExitAllowed,
        earlyExitPenaltyType,
        earlyExitPenaltyValue,
        modificationThreshold,
        securityModel,
        guaranteeAmount,
    } = req.body;

    // ── Validation ────────────────────────────────────────────
    const errors: string[] = [];

    if (!['rotative', 'crescendo'].includes(type))
        errors.push('type invalide (rotative | crescendo)');
    if (!name || name.trim().length < 3)
        errors.push('nom requis (min 3 caractères)');
    if (!amount || isNaN(amount) || amount < 1000)
        errors.push('montant minimum : 1 000 FCFA');
    if (!['daily', 'weekly', 'biweekly', 'monthly'].includes(frequency))
        errors.push('fréquence invalide');
    if (!totalMembers || totalMembers < 2 || totalMembers > 50)
        errors.push('nombre de membres : entre 2 et 50');
    if (!['random', 'seniority', 'consensual', 'manual'].includes(rotationMethod))
        errors.push('ordre de rotation invalide');
    if (!['escrow', 'direct', 'blocked_account', 'solidarity'].includes(securityModel))
        errors.push('modèle de sécurité invalide');
    if (securityModel === 'solidarity' && (!guaranteeAmount || guaranteeAmount < 0))
        errors.push('montant de caution requis pour le modèle solidarité');
    if (iconUrl && !/^https?:\/\/.+/.test(iconUrl))
        errors.push('iconUrl invalide');

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    let tontineId: string | null = null;

    try {
        const creatorDoc = await db.collection('users').doc(uid).get();
        const creatorData = creatorDoc.data() ?? {};

        const tontineRef = db.collection('tontines').doc();
        tontineId = tontineRef.id;

        let inviteCode = generateInviteCode();
        const existing = await db
            .collection('tontines')
            .where('inviteCode', '==', inviteCode)
            .get();
        if (!existing.empty) inviteCode = generateInviteCode() + '1';

        const nextPaymentDate = getNextPaymentDate(frequency, paymentDay);
        const totalTurns = Number(totalMembers);

        await db.runTransaction(async (transaction) => {

            // 1. Document principal de la tontine
            transaction.set(tontineRef, {
                id: tontineId,
                name: name.trim(),
                description: description?.trim() ?? null,
                iconUrl: iconUrl ?? null,
                type,
                visibility: visibility ?? 'private',
                status: 'pending',
                amount: Number(amount),
                currency: 'XOF',
                frequency,
                paymentDay: paymentDay ?? null,
                totalMembers: Number(totalMembers),
                currentMembers: 1,
                potPerTurn: Number(amount) * Number(totalMembers),
                rotationMethod,
                currentTurn: 0,
                totalTurns,
                securityModel,
                guaranteeAmount: securityModel === 'solidarity' ? Number(guaranteeAmount) : null,
                inviteCode,
                inviteLink: `https://tontineplus.app/join/${inviteCode}`,
                rules: {
                    gracePeriodDays: Number(gracePeriodDays ?? 0),
                    penaltyType: penaltyType ?? 'percentage',
                    penaltyValue: Number(penaltyValue ?? 0),
                    autoExclusionDays: autoExclusionDays ? Number(autoExclusionDays) : null,
                    earlyExitAllowed: earlyExitAllowed === true || earlyExitAllowed === 'true',
                    earlyExitPenaltyType: earlyExitPenaltyType ?? null,
                    earlyExitPenaltyValue: earlyExitPenaltyValue ? Number(earlyExitPenaltyValue) : null,
                    modificationThreshold: modificationThreshold ? Number(modificationThreshold) : 75,
                    locked: modificationThreshold === 100,
                },
                stats: {
                    totalCollected: 0,
                    totalDistributed: 0,
                    onTimePaymentRate: 100,
                    averagePaymentDelay: 0,
                },
                createdBy: uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                startedAt: null,
                endedAt: null,
                nextPaymentDate: admin.firestore.Timestamp.fromDate(nextPaymentDate),
            });

            // 2. Sous-collection members/ — données du créateur
            const memberRef = tontineRef.collection('members').doc(uid);
            transaction.set(memberRef, {
                id: uid,
                tontineId,
                userId: uid,
                userName: creatorData.fullName ?? null,
                userPhotoUrl: creatorData.photoUrl ?? null,
                role: 'creator',
                status: 'active',
                turnNumber: null,
                validationCount: 0,
                validatedBy: [],
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                validatedAt: admin.firestore.FieldValue.serverTimestamp(),
                leftAt: null,
                excludedAt: null,
                stats: {
                    totalPaid: 0,
                    totalReceived: 0,
                    onTimePayments: 0,
                    latePayments: 0,
                    missedPayments: 0,
                    voteParticipation: 0,
                },
            });

            // 3. ✅ NOUVEAU — on enregistre l'ID dans users/{uid}.tontineIds[]
            //    arrayUnion évite les doublons et crée le champ s'il n'existe pas
            const userRef = db.collection('users').doc(uid);
            transaction.update(userRef, {
                tontineIds: admin.firestore.FieldValue.arrayUnion(tontineId),
            });
        });

        return res.status(201).json({
            success: true,
            message: 'Tontine créée avec succès',
            data: {
                tontineId,
                inviteCode,
                inviteLink: `https://tontineplus.app/join/${inviteCode}`,
                potPerTurn: Number(amount) * Number(totalMembers),
                totalTurns,
                status: 'pending',
            },
        });

    } catch (err: any) {
        if (tontineId) {
            try { await db.collection('tontines').doc(tontineId).delete(); } catch (_) { }
        }
        return res.status(500).json({
            success: false,
            error: 'Une erreur est survenue lors de la création. Veuillez réessayer.',
            detail: err.message,
        });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/tontines — MES TONTINES
//
// Changement clé : on lit users/{uid}.tontineIds[] directement
// Zéro collectionGroup, zéro index composite requis
// ─────────────────────────────────────────────────────────────
export const getMyTontines = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { status } = req.query;

    try {
        // 1. Lire la liste des IDs depuis le profil utilisateur
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
        }

        const tontineIds: string[] = userDoc.data()?.tontineIds ?? [];

        if (tontineIds.length === 0) {
            return res.json({ success: true, data: [], count: 0 });
        }

        // 2. Récupérer les tontines en chunks de 30 (limite Firestore `in`)
        const chunks: string[][] = [];
        for (let i = 0; i < tontineIds.length; i += 30) {
            chunks.push(tontineIds.slice(i, i + 30));
        }

        const tontines: any[] = [];

        for (const chunk of chunks) {
            let query = db
                .collection('tontines')
                .where(admin.firestore.FieldPath.documentId(), 'in', chunk);

            if (status) {
                query = query.where('status', '==', status) as any;
            }

            const snap = await query.get();
            snap.docs.forEach((doc) => {
                tontines.push({ id: doc.id, ...doc.data() });
            });
        }

        // 3. Trier par date de création décroissante (la plus récente en premier)
        tontines.sort((a, b) => {
            const dateA = a.createdAt?.toMillis?.() ?? 0;
            const dateB = b.createdAt?.toMillis?.() ?? 0;
            return dateB - dateA;
        });

        return res.json({ success: true, data: tontines, count: tontines.length });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/tontines/:id — DÉTAILS D'UNE TONTINE
// ─────────────────────────────────────────────────────────────
export const getTontineById = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    if (!id) return res.status(400).json({ success: false, error: 'ID requis' });

    try {
        const tontineDoc = await db.collection('tontines').doc(id).get();

        if (!tontineDoc.exists) {
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });
        }

        const memberDoc = await db
            .collection('tontines').doc(id)
            .collection('members').doc(uid)
            .get();

        if (!memberDoc.exists) {
            return res.status(403).json({
                success: false,
                error: "Accès refusé — vous n'êtes pas membre de cette tontine",
            });
        }

        return res.json({
            success: true,
            data: {
                id: tontineDoc.id,
                ...tontineDoc.data(),
                myRole: memberDoc.data()?.role,
                myTurnNumber: memberDoc.data()?.turnNumber,
                myStats: memberDoc.data()?.stats,
            },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/tontines/:id — MODIFIER UNE TONTINE
// ─────────────────────────────────────────────────────────────
export const updateTontine = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    if (!id) return res.status(400).json({ success: false, error: 'ID requis' });

    const ALLOWED_FIELDS = [
        'name', 'description', 'iconUrl', 'visibility',
        'amount', 'frequency', 'paymentDay', 'totalMembers',
    ];

    try {
        const tontineDoc = await db.collection('tontines').doc(id).get();

        if (!tontineDoc.exists) {
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });
        }

        const tontine = tontineDoc.data()!;

        if (tontine.createdBy !== uid) {
            return res.status(403).json({
                success: false,
                error: 'Seul le créateur peut modifier la tontine',
            });
        }

        if (tontine.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: 'Impossible de modifier une tontine déjà active',
            });
        }

        const updates: Record<string, any> = {};
        ALLOWED_FIELDS.forEach((field) => {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        });

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'Aucun champ valide à mettre à jour' });
        }

        if (updates.iconUrl && !/^https?:\/\/.+/.test(updates.iconUrl)) {
            return res.status(400).json({ success: false, error: 'iconUrl invalide' });
        }

        const newAmount = updates.amount ?? tontine.amount;
        const newTotal = updates.totalMembers ?? tontine.totalMembers;
        updates.potPerTurn = Number(newAmount) * Number(newTotal);
        updates.totalTurns = Number(newTotal);
        updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

        await db.collection('tontines').doc(id).update(updates);

        return res.json({
            success: true,
            message: 'Tontine mise à jour',
            data: { id, ...updates },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/v1/tontines/:id — SUPPRIMER UNE TONTINE
//
// Changement clé : on retire aussi l'ID de users/{uid}.tontineIds[]
// ─────────────────────────────────────────────────────────────
export const deleteTontine = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    if (!id) return res.status(400).json({ success: false, error: 'ID requis' });

    try {
        const tontineDoc = await db.collection('tontines').doc(id).get();

        if (!tontineDoc.exists) {
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });
        }

        const tontine = tontineDoc.data()!;

        if (tontine.createdBy !== uid) {
            return res.status(403).json({
                success: false,
                error: 'Seul le créateur peut supprimer la tontine',
            });
        }

        if (tontine.status === 'active') {
            return res.status(400).json({
                success: false,
                error: 'Impossible de supprimer une tontine active. Lancez un vote de dissolution.',
            });
        }

        // 1. Récupérer tous les membres pour nettoyer leurs tontineIds[]
        const membersSnap = await db
            .collection('tontines').doc(id)
            .collection('members')
            .get();

        const memberUids = membersSnap.docs.map((d) => d.id);

        const batch = db.batch();

        // 2. Supprimer les sous-collections
        const subcollections = ['members', 'chat'];
        for (const sub of subcollections) {
            const snap = await db.collection('tontines').doc(id).collection(sub).get();
            snap.docs.forEach((doc) => batch.delete(doc.ref));
        }

        // 3. Supprimer le document tontine
        batch.delete(db.collection('tontines').doc(id));

        // 4. ✅ NOUVEAU — retirer l'ID de tontineIds[] pour chaque membre
        for (const memberUid of memberUids) {
            const userRef = db.collection('users').doc(memberUid);
            batch.update(userRef, {
                tontineIds: admin.firestore.FieldValue.arrayRemove(id),
            });
        }

        await batch.commit();

        return res.json({ success: true, message: 'Tontine supprimée avec succès' });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/tontines/:id/invite — LIEN + QR CODE
// ─────────────────────────────────────────────────────────────
export const getTontineInvite = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    if (!id) return res.status(400).json({ success: false, error: 'ID requis' });

    try {
        const tontineDoc = await db.collection('tontines').doc(id).get();

        if (!tontineDoc.exists) {
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });
        }

        const tontine = tontineDoc.data()!;

        const memberDoc = await db
            .collection('tontines').doc(id)
            .collection('members').doc(uid)
            .get();

        if (!memberDoc.exists) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        const inviteLink = `https://tontineplus.app/join/${tontine.inviteCode}`;
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(inviteLink)}`;

        return res.json({
            success: true,
            data: {
                inviteCode: tontine.inviteCode,
                inviteLink,
                qrCodeUrl,
                tontineName: tontine.name,
                iconUrl: tontine.iconUrl ?? null,
                membersCount: `${tontine.currentMembers}/${tontine.totalMembers}`,
            },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};