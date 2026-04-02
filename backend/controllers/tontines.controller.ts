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
// on écrit `tontineId` dans users/{uid}.tontineIds[]
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
        autoExclusionDays,         // nombre de jours OU null = jamais
        earlyExitAllowed,          // 'penalty' | 'vote' | 'locked'
        earlyExitPenaltyType,      // 'guarantee' | 'paid_contributions' | null
        modificationThreshold,
        securityModel,
        guaranteeAmount,
    } = req.body;

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION
    // ─────────────────────────────────────────────────────────────────────────
    const errors: string[] = [];

    // ── 1. Type de tontine ────────────────────────────────────────────────────
    const VALID_TYPES = ['rotative', 'crescendo', 'solidarity', 'savings_goal'];
    if (!type || !VALID_TYPES.includes(type))
        errors.push(`type invalide - valeurs acceptées : ${VALID_TYPES.join(' | ')}`);

    // ── 2. Nom ────────────────────────────────────────────────────────────────
    if (!name || name.trim().length < 3)
        errors.push('nom requis (minimum 3 caractères)');

    // ── 3. Visibilité ─────────────────────────────────────────────────────────
    //   'public' accepté en base mais signalé comme non implémenté côté app
    const VALID_VISIBILITY = ['private', 'semi_public', 'public'];
    if (visibility && !VALID_VISIBILITY.includes(visibility))
        errors.push(`visibility invalide - valeurs acceptées : ${VALID_VISIBILITY.join(' | ')}`);

    // ── 4. Montant ────────────────────────────────────────────────────────────
    if (!amount || isNaN(Number(amount)) || Number(amount) < 200)
        errors.push('montant minimum : 200 FCFA');

    // ── 5. Fréquence ──────────────────────────────────────────────────────────
    const VALID_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'];
    if (!frequency || !VALID_FREQUENCIES.includes(frequency))
        errors.push(`fréquence invalide - valeurs acceptées : ${VALID_FREQUENCIES.join(' | ')}`);

    // ── 6. Nombre de membres ──────────────────────────────────────────────────
    const membersCount = Number(totalMembers);
    if (!totalMembers || isNaN(membersCount) || membersCount < 2 || membersCount > 50)
        errors.push('nombre de membres : entre 2 et 50');

    // ── 7. Ordre de rotation ──────────────────────────────────────────────────
    const VALID_ROTATION = ['random', 'seniority', 'consensual', 'manual'];
    if (!rotationMethod || !VALID_ROTATION.includes(rotationMethod))
        errors.push(`ordre de rotation invalide - valeurs acceptées : ${VALID_ROTATION.join(' | ')}`);

    // ── 8. Délai de grâce ─────────────────────────────────────────────────────
    const VALID_GRACE_DAYS = [0, 1, 2, 3, 5, 7];
    const graceDays = Number(gracePeriodDays ?? 0);
    if (!VALID_GRACE_DAYS.includes(graceDays))
        errors.push(`gracePeriodDays invalide - valeurs acceptées : ${VALID_GRACE_DAYS.join(' | ')}`);

    // ── 9. Pénalité de retard ─────────────────────────────────────────────────
    const VALID_PENALTY_TYPES = ['percentage', 'fixed'];
    if (penaltyType && !VALID_PENALTY_TYPES.includes(penaltyType))
        errors.push(`penaltyType invalide - valeurs acceptées : ${VALID_PENALTY_TYPES.join(' | ')}`);

    const penaltyVal = Number(penaltyValue ?? 0);
    if (penaltyType === 'percentage') {
        const VALID_PCT = [0, 2, 5, 10];
        if (!VALID_PCT.includes(penaltyVal))
            errors.push(`penaltyValue (percentage) invalide - valeurs acceptées : ${VALID_PCT.join(' | ')}`);
    }
    if (penaltyType === 'fixed' && (isNaN(penaltyVal) || penaltyVal < 0))
        errors.push('penaltyValue (fixed) doit être un montant positif');

    // ── 10. Exclusion automatique ─────────────────────────────────────────────
    //   null / undefined = jamais (vote requis) ; sinon 7 | 14 | 30
    const VALID_EXCLUSION_DAYS = [7, 14, 30];
    if (autoExclusionDays !== null && autoExclusionDays !== undefined) {
        const excDays = Number(autoExclusionDays);
        if (!VALID_EXCLUSION_DAYS.includes(excDays))
            errors.push(`autoExclusionDays invalide - valeurs acceptées : ${VALID_EXCLUSION_DAYS.join(' | ')} ou null (jamais)`);
    }

    // ── 11. Règles de sortie anticipée ────────────────────────────────────────
    const VALID_EARLY_EXIT = ['penalty', 'vote', 'locked'];
    if (!earlyExitAllowed || !VALID_EARLY_EXIT.includes(earlyExitAllowed))
        errors.push(`earlyExitAllowed invalide - valeurs acceptées : ${VALID_EARLY_EXIT.join(' | ')}`);

    //   Si sortie avec pénalité, le type de pénalité est requis
    if (earlyExitAllowed === 'penalty') {
        const VALID_EXIT_PENALTY = ['guarantee', 'paid_contributions'];
        if (!earlyExitPenaltyType || !VALID_EXIT_PENALTY.includes(earlyExitPenaltyType))
            errors.push(`earlyExitPenaltyType requis quand earlyExitAllowed='penalty' - valeurs acceptées : ${VALID_EXIT_PENALTY.join(' | ')}`);
    }

    // ── 12. Modèle de sécurité ────────────────────────────────────────────────
    const VALID_SECURITY = ['escrow', 'direct', 'solidarity_guarantee'];
    if (!securityModel || !VALID_SECURITY.includes(securityModel))
        errors.push(`securityModel invalide - valeurs acceptées : ${VALID_SECURITY.join(' | ')}`);

    //   Caution obligatoire pour le modèle "garantie solidaire"
    if (securityModel === 'solidarity_guarantee') {
        const gAmt = Number(guaranteeAmount);
        if (!guaranteeAmount || isNaN(gAmt) || gAmt <= 0)
            errors.push('guaranteeAmount requis (> 0) pour le modèle solidarity_guarantee');
    }

    // ── 13. URL de l'icône (optionnel) ────────────────────────────────────────
    if (iconUrl && !/^https?:\/\/.+/.test(iconUrl))
        errors.push('iconUrl invalide (doit commencer par http:// ou https://)');

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CRÉATION EN BASE
    // ─────────────────────────────────────────────────────────────────────────
    let tontineId: string | null = null;

    try {
        const creatorDoc = await db.collection('users').doc(uid).get();
        const creatorData = creatorDoc.data() ?? {};

        const tontineRef = db.collection('tontines').doc();
        tontineId = tontineRef.id;

        // Code d'invitation unique
        let inviteCode = generateInviteCode();
        const existing = await db
            .collection('tontines')
            .where('inviteCode', '==', inviteCode)
            .get();
        if (!existing.empty) inviteCode = generateInviteCode() + '1';

        const nextPaymentDate = getNextPaymentDate(frequency, paymentDay);
        const totalTurns = membersCount;

        await db.runTransaction(async (transaction) => {

            // 1. Document principal de la tontine
            transaction.set(tontineRef, {
                id: tontineId,
                name: name.trim(),
                description: description?.trim() ?? null,
                iconUrl: iconUrl ?? null,

                // Identité
                type,                                    // 'rotative' | 'crescendo' | 'solidarity' | 'savings_goal'
                visibility: visibility ?? 'private',     // 'private' | 'semi_public' | 'public'
                status: 'pending',

                // Finance
                amount: Number(amount),
                currency: 'XOF',
                frequency,
                paymentDay: paymentDay ?? null,
                potPerTurn: Number(amount) * membersCount,

                // Membres & rotation
                totalMembers: membersCount,
                currentMembers: 1,
                rotationMethod,                          // 'random' | 'seniority' | 'consensual' | 'manual'
                currentTurn: 0,
                totalTurns,

                // Sécurité
                securityModel,                           // 'escrow' | 'direct' | 'solidarity_guarantee'
                guaranteeAmount: securityModel === 'solidarity_guarantee'
                    ? Number(guaranteeAmount)
                    : null,

                // Liens d'invitation
                inviteCode,
                inviteLink: `https://tontineplus.app/join/${inviteCode}`,

                // Règles
                rules: {
                    // Retards
                    gracePeriodDays: graceDays,
                    penaltyType: penaltyType ?? 'percentage',
                    penaltyValue: penaltyVal,
                    autoExclusionDays: autoExclusionDays != null
                        ? Number(autoExclusionDays)
                        : null,                         // null = jamais (vote requis)

                    // Sortie anticipée
                    earlyExit: {
                        mode: earlyExitAllowed,          // 'penalty' | 'vote' | 'locked'
                        penaltyType: earlyExitAllowed === 'penalty'
                            ? (earlyExitPenaltyType ?? null) // 'guarantee' | 'paid_contributions'
                            : null,
                    },

                    // Gouvernance
                    modificationThreshold: modificationThreshold
                        ? Number(modificationThreshold)
                        : 75,
                    locked: Number(modificationThreshold) === 100,

                    // Rotation consensuelle : seuil de vote = 75 %
                    consensusThreshold: rotationMethod === 'consensual' ? 75 : null,
                },

                // Stats initiales
                stats: {
                    totalCollected: 0,
                    totalDistributed: 0,
                    onTimePaymentRate: 100,
                    averagePaymentDelay: 0,
                },

                // Méta
                createdBy: uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                startedAt: null,
                endedAt: null,
                nextPaymentDate: admin.firestore.Timestamp.fromDate(nextPaymentDate),
            });

            // 2. Sous-collection members/ — créateur
            const memberRef = tontineRef.collection('members').doc(uid);
            transaction.set(memberRef, {
                id: uid,
                tontineId,
                userId: uid,
                userName: creatorData.fullName ?? null,
                userPhotoUrl: creatorData.photoUrl ?? null,
                role: 'creator',
                status: 'active',
                turnNumber: rotationMethod === 'seniority' ? 1 : null, // créateur en 1er si ancienneté
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

            // 3. Référence de la tontine dans le profil du créateur
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
                potPerTurn: Number(amount) * membersCount,
                totalTurns,
                status: 'pending',
            },
        });

    } catch (err: any) {
        // Nettoyage en cas d'erreur partielle
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
// on retire l'ID de users/{uid}.tontineIds[]
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

        // 4. retirer l'ID de tontineIds[] pour chaque membre
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