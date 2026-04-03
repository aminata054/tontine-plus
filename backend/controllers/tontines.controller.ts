import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { buildNotificationDoc, sendNotificationToUser } from '../services/notification.service';

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

const getFrequencyInDays = (frequency: string): number => {
    switch (frequency) {
        case 'daily': return 1;
        case 'weekly': return 7;
        case 'biweekly': return 14;
        case 'monthly': return 30;
        default: return 0;
    }
};

// ─────────────────────────────────────────────────────────────
// UTILITAIRE : Attribuer les tours à tous les membres
// Appelé automatiquement quand la tontine est complète
// ─────────────────────────────────────────────────────────────
const assignTurns = async (
    tontineId: string,
    rotationMethod: string,
    transaction: FirebaseFirestore.Transaction,
    createdBy?: string
): Promise<void> => {

    const membersSnap = await db
        .collection('tontines').doc(tontineId)
        .collection('members')
        .where('status', '==', 'active')
        .get();

    const members = membersSnap.docs.map(doc => ({
        ref: doc.ref,
        joinedAt: doc.data().joinedAt?.toMillis?.() ?? 0,
        uid: doc.id,
    }));

    let orderedMembers: Array<{ ref: FirebaseFirestore.DocumentReference; joinedAt: number; uid: string }>;

    switch (rotationMethod) {

        case 'seniority':
            // Trier par date d'adhésion croissante (le plus ancien = tour 1)
            orderedMembers = [...members].sort((a, b) => a.joinedAt - b.joinedAt);
            break;

        case 'random':
            const creatorMember = createdBy
                ? members.find(m => m.uid === createdBy) ?? null
                : null;
            const rest = members.filter(m => m.uid !== creatorMember?.uid);

            // Fisher-Yates sur les membres restants uniquement
            for (let i = rest.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = rest[i]!;
                rest[i] = rest[j]!;
                rest[j] = temp;
            }

            orderedMembers = creatorMember ? [creatorMember, ...rest] : rest;
            break;

        case 'manual':
        case 'consensual':
            // Pour 'manual' et 'consensual' : pas d'assignation automatique ici
            // - 'manual'      → le créateur assignera via un endpoint dédié
            // - 'consensual'  → un vote déterminera l'ordre (endpoint /votes)
            // On attribue turnNumber = null pour tous, la tontine démarre quand même
            orderedMembers = members;
            for (const m of orderedMembers) {
                transaction.update(m.ref, { turnNumber: null });
            }
            return;

        default:
            orderedMembers = members;
    }

    // Écrire le turnNumber (1-based) pour chaque membre
    orderedMembers.forEach((m, index) => {
        transaction.update(m.ref, { turnNumber: index + 1 });
    });

    // Écrire l'ordre dans le document tontine pour référence rapide
    const turnOrder = orderedMembers.map(m => m.uid);
    transaction.update(
        db.collection('tontines').doc(tontineId),
        { turnOrder }
    );
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


        const frequencyInDays = getFrequencyInDays(frequency);
        const estimatedDuration = totalTurns * frequencyInDays;

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
                estimatedDuration,
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

// ─────────────────────────────────────────────────────────────
// GET /api/v1/tontines/join/:code — PREVIEW PUBLIQUE
//
// Accessible SANS être membre — l'utilisateur voit les infos
// avant de décider de rejoindre.
// ─────────────────────────────────────────────────────────────
export const getJoinPreview = async (
    req: Request<{ code: string }>,
    res: Response
) => {
    const uid = (req as any).user?.uid ?? null; // optionnel : auth non requise
    const { code } = req.params;

    if (!code || code.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Code d\'invitation requis' });
    }

    try {
        // 1. Rechercher la tontine par son inviteCode
        const snap = await db
            .collection('tontines')
            .where('inviteCode', '==', code.toUpperCase().trim())
            .limit(1)
            .get();

        if (snap.empty) {
            return res.status(404).json({
                success: false,
                error: 'Lien d\'invitation invalide ou expiré',
            });
        }

        const [tontineDoc] = snap.docs;
        if (!tontineDoc) {
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });
        }
        const tontine = tontineDoc.data();
        const tontineId = tontineDoc.id;

        // 2. Vérifications d'éligibilité
        if (tontine.status === 'active') {
            return res.status(400).json({
                success: false,
                error: 'Cette tontine a déjà commencé, les inscriptions sont closes',
            });
        }

        if (tontine.status === 'completed' || tontine.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                error: 'Cette tontine n\'est plus disponible',
            });
        }

        if (tontine.currentMembers >= tontine.totalMembers) {
            return res.status(400).json({
                success: false,
                error: 'Cette tontine est complète, plus de place disponible',
            });
        }

        // 3. Si l'utilisateur est connecté, vérifier s'il est déjà membre
        let alreadyMember = false;
        let memberStatus: string | null = null;

        if (uid) {
            const memberDoc = await db
                .collection('tontines').doc(tontineId)
                .collection('members').doc(uid)
                .get();

            if (memberDoc.exists) {
                alreadyMember = true;
                memberStatus = memberDoc.data()?.status ?? null;
            }
        }

        const frequencyInDays = getFrequencyInDays(tontine.frequency);
        // 4. Retourner uniquement les infos publiques nécessaires pour la preview
        // Récupérer les infos du créateur
        const creatorDoc = await db.collection('users').doc(tontine.createdBy).get();
        const creatorData = creatorDoc.data() ?? {};

        return res.json({
            success: true,
            data: {
                tontineId,
                createdBy: tontine.createdBy,
                estimatedDuration: tontine.totalTurns && frequencyInDays
                    ? tontine.totalTurns * frequencyInDays
                    : null,
                creatorName: creatorData.fullName ?? null,
                creatorPhotoUrl: creatorData.photoUrl ?? null,
                name: tontine.name,
                description: tontine.description ?? null,
                iconUrl: tontine.iconUrl ?? null,
                type: tontine.type,
                visibility: tontine.visibility,
                amount: tontine.amount,
                currency: tontine.currency,
                frequency: tontine.frequency,
                potPerTurn: tontine.potPerTurn,
                totalMembers: tontine.totalMembers,
                currentMembers: tontine.currentMembers,
                slotsLeft: tontine.totalMembers - tontine.currentMembers,
                rotationMethod: tontine.rotationMethod,
                securityModel: tontine.securityModel,
                nextPaymentDate: tontine.nextPaymentDate,
                rules: {
                    gracePeriodDays: tontine.rules?.gracePeriodDays ?? 0,
                    penaltyType: tontine.rules?.penaltyType ?? null,
                    penaltyValue: tontine.rules?.penaltyValue ?? 0,
                    earlyExit: tontine.rules?.earlyExit ?? null,
                },
                alreadyMember,
                memberStatus,
            },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/tontines/join/:code — REJOINDRE UNE TONTINE
//
// Crée un document member avec status 'pending_approval'
// (ou 'active' si visibility === 'public')
// Notifie le créateur via un document dans /notifications/
// ─────────────────────────────────────────────────────────────
export const joinTontine = async (
    req: Request<{ code: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { code } = req.params;

    if (!code || code.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Code d\'invitation requis' });
    }

    try {
        // 1. Récupérer la tontine
        const snap = await db
            .collection('tontines')
            .where('inviteCode', '==', code.toUpperCase().trim())
            .limit(1)
            .get();

        if (snap.empty) {
            return res.status(404).json({
                success: false,
                error: 'Lien d\'invitation invalide ou expiré',
            });
        }

        const [tontineDoc] = snap.docs;
        if (!tontineDoc) {
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });
        } const tontine = tontineDoc.data();
        const tontineId = tontineDoc.id;

        // 2. Vérifications
        if (tontine.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: tontine.status === 'active'
                    ? 'Cette tontine a déjà commencé'
                    : 'Cette tontine n\'est plus disponible',
            });
        }

        if (tontine.currentMembers >= tontine.totalMembers) {
            return res.status(400).json({
                success: false,
                error: 'Cette tontine est complète',
            });
        }

        if (tontine.createdBy === uid) {
            return res.status(400).json({
                success: false,
                error: 'Vous êtes déjà créateur de cette tontine',
            });
        }

        // 3. Vérifier si déjà membre
        const existingMember = await db
            .collection('tontines').doc(tontineId)
            .collection('members').doc(uid)
            .get();

        if (existingMember.exists) {
            const existingStatus = existingMember.data()?.status;
            const messages: Record<string, string> = {
                active: 'Vous êtes déjà membre de cette tontine',
                pending_approval: 'Votre demande est déjà en attente de validation',
                rejected: 'Votre demande a été refusée par l\'administrateur',
            };
            return res.status(400).json({
                success: false,
                error: messages[existingStatus] ?? 'Vous avez déjà une demande pour cette tontine',
            });
        }

        // 4. Récupérer le profil du nouvel adhérent
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() ?? {};

        // 5. Déterminer le statut initial selon la visibilité
        //    - 'public' : acceptation automatique
        //    - 'private' | 'semi_public' : validation par le créateur
        const isAutoAccept = tontine.visibility === 'public';
        const memberStatus = isAutoAccept ? 'active' : 'pending_approval';

        await db.runTransaction(async (transaction) => {
            // a. Créer le document member
            const memberRef = db
                .collection('tontines').doc(tontineId)
                .collection('members').doc(uid);

            transaction.set(memberRef, {
                id: uid,
                tontineId,
                userId: uid,
                userName: userData.fullName ?? null,
                userPhotoUrl: userData.photoUrl ?? null,
                role: 'member',
                status: memberStatus,
                turnNumber: null,
                validationCount: 0,
                validatedBy: [],
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                validatedAt: isAutoAccept
                    ? admin.firestore.FieldValue.serverTimestamp()
                    : null,
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

            // b. Si auto-accepté : mettre à jour currentMembers + tontineIds
            if (isAutoAccept) {
                const tontineRef = db.collection('tontines').doc(tontineId);
                transaction.update(tontineRef, {
                    currentMembers: admin.firestore.FieldValue.increment(1),
                });

                const userRef = db.collection('users').doc(uid);
                transaction.update(userRef, {
                    tontineIds: admin.firestore.FieldValue.arrayUnion(tontineId),
                });
            }

            // c. Créer une notification pour le créateur (ou in-app notification)
            if (!isAutoAccept) {
                const notif = buildNotificationDoc(tontine.createdBy, {
                    title: 'Nouvelle demande',
                    body: `${userData.fullName ?? 'Un utilisateur'} souhaite rejoindre ${tontine.name}`,
                    type: 'join_request',
                    tontineId,
                    tontineName: tontine.name,
                    senderUid: uid,
                });

                transaction.set(notif.ref, notif.data);
                await sendNotificationToUser(tontine.createdBy, notif.data);
            }
        });

        return res.status(201).json({
            success: true,
            message: isAutoAccept
                ? 'Vous avez rejoint la tontine avec succès'
                : 'Votre demande a été envoyée, en attente de validation par le créateur',
            data: {
                tontineId,
                memberStatus,
                autoAccepted: isAutoAccept,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/tontines/:id/members — LISTE DES MEMBRES
//
// Supporte ?status=pending_approval pour la vue admin
// Accessible au créateur et aux admins uniquement pour le filtre pending
// ─────────────────────────────────────────────────────────────
export const getTontineMembers = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id } = req.params;
    const { status } = req.query;

    if (!id) return res.status(400).json({ success: false, error: 'ID requis' });

    try {
        // 1. Vérifier l'accès à la tontine
        const tontineDoc = await db.collection('tontines').doc(id).get();

        if (!tontineDoc.exists) {
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });
        }

        const tontine = tontineDoc.data()!;

        // Vérifier que l'utilisateur est bien membre
        const callerMemberDoc = await db
            .collection('tontines').doc(id)
            .collection('members').doc(uid)
            .get();

        if (!callerMemberDoc.exists) {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé — vous n\'êtes pas membre de cette tontine',
            });
        }

        const callerRole = callerMemberDoc.data()?.role;

        // Seuls creator et admin peuvent voir les pending
        if (status === 'pending_approval' && !['creator', 'admin'].includes(callerRole)) {
            return res.status(403).json({
                success: false,
                error: 'Seul le créateur ou un admin peut voir les demandes en attente',
            });
        }

        // 2. Construire la requête
        let query: FirebaseFirestore.Query = db
            .collection('tontines').doc(id)
            .collection('members');

        if (status) {
            query = query.where('status', '==', status);
        }

        const membersSnap = await query.orderBy('joinedAt', 'asc').get();

        const members = membersSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));

        return res.json({
            success: true,
            data: members,
            count: members.length,
            tontineName: tontine.name,
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/tontines/:id/members/:uid/validate
//
// action : 'accept' | 'reject'
//
// Si accept :
//   - member.status → 'active'
//   - tontine.currentMembers++
//   - users/{memberUid}.tontineIds[] += tontineId
//   - Si currentMembers === totalMembers → tontine.status = 'active'
//   - Notification au membre
//
// Si reject :
//   - member.status → 'rejected'
//   - Notification au membre
// ─────────────────────────────────────────────────────────────
export const validateMember = async (
    req: Request<{ id: string; uid: string }>,
    res: Response
) => {
    const callerUid = (req as any).user.uid;
    const { id: tontineId, uid: memberUid } = req.params;
    const { action } = req.body as { action: 'accept' | 'reject' };

    // Validation des paramètres
    if (!tontineId) return res.status(400).json({ success: false, error: 'ID tontine requis' });
    if (!memberUid) return res.status(400).json({ success: false, error: 'UID membre requis' });
    if (!['accept', 'reject'].includes(action)) {
        return res.status(400).json({
            success: false,
            error: 'action invalide — valeurs acceptées : accept | reject',
        });
    }

    if (callerUid === memberUid) {
        return res.status(400).json({
            success: false,
            error: 'Vous ne pouvez pas valider votre propre adhésion',
        });
    }

    try {
        // 1. Vérifier que le caller est créateur ou admin de la tontine
        const tontineRef = db.collection('tontines').doc(tontineId);
        const tontineDoc = await tontineRef.get();

        if (!tontineDoc.exists) {
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });
        }

        const tontine = tontineDoc.data()!;

        const callerMemberDoc = await db
            .collection('tontines').doc(tontineId)
            .collection('members').doc(callerUid)
            .get();

        if (!callerMemberDoc.exists) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        const callerRole = callerMemberDoc.data()?.role;
        if (!['creator', 'admin'].includes(callerRole)) {
            return res.status(403).json({
                success: false,
                error: 'Seul le créateur ou un admin peut valider les membres',
            });
        }

        // 2. Vérifier que le membre existe et est bien en attente
        const memberRef = db
            .collection('tontines').doc(tontineId)
            .collection('members').doc(memberUid);

        const memberDoc = await memberRef.get();

        if (!memberDoc.exists) {
            return res.status(404).json({ success: false, error: 'Membre introuvable' });
        }

        const memberData = memberDoc.data()!;

        if (memberData.status !== 'pending_approval') {
            return res.status(400).json({
                success: false,
                error: `Ce membre n'est pas en attente de validation (statut actuel : ${memberData.status})`,
            });
        }

        // 3. Vérifier la place disponible si accept
        if (action === 'accept' && tontine.currentMembers >= tontine.totalMembers) {
            return res.status(400).json({
                success: false,
                error: 'La tontine est complète, impossible d\'accepter ce membre',
            });
        }

        // 4. Transaction Firestore
        let tontineAutoStarted = false;

        await db.runTransaction(async (transaction) => {
            if (action === 'accept') {
                const newMemberCount = tontine.currentMembers + 1;
                const isFull = newMemberCount >= tontine.totalMembers;
                tontineAutoStarted = isFull;

                // a. Mettre à jour le document member
                transaction.update(memberRef, {
                    status: 'active',
                    validatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    validatedBy: admin.firestore.FieldValue.arrayUnion(callerUid),
                });

                // b. Incrémenter currentMembers (et passer active si complet)
                const tontineUpdate: Record<string, any> = {
                    currentMembers: admin.firestore.FieldValue.increment(1),
                };

                transaction.update(tontineRef, tontineUpdate);
                if (isFull) {
                    await assignTurns(tontineId, tontine.rotationMethod, transaction, tontine.createdBy);
                }

                // c. Ajouter tontineId dans le profil du membre
                const userRef = db.collection('users').doc(memberUid);
                transaction.update(userRef, {
                    tontineIds: admin.firestore.FieldValue.arrayUnion(tontineId),
                });

                // d. Notification d'acceptation pour le membre
                const notif = buildNotificationDoc(memberUid, {
                    title: 'Demande acceptée',
                    body: `Vous avez été accepté dans ${tontine.name}`,
                    type: 'join_accepted',
                    tontineId,
                    tontineName: tontine.name,
                    senderUid: callerUid,
                });

                transaction.set(notif.ref, notif.data);
                await sendNotificationToUser(memberUid, notif.data);

                // e. Si tontine démarrée automatiquement : notifier tous les membres actifs
                if (isFull) {
                    const allMembersSnap = await db
                        .collection('tontines').doc(tontineId)
                        .collection('members')
                        .where('status', '==', 'active')
                        .get();

                    for (const m of allMembersSnap.docs) {
                        if (m.id === memberUid) continue; // déjà notifié
                        const startNotif = buildNotificationDoc(m.id, {
                            title: 'Tontine démarrée',
                            body: `${tontine.name} est maintenant complète et a démarré !`,
                            type: 'tontine_started',
                            tontineId,
                            tontineName: tontine.name,
                            senderUid: callerUid,
                        });
                        transaction.set(startNotif.ref, startNotif.data);
                        await sendNotificationToUser(m.id, startNotif.data);
                    }
                }

            } else {
                // Refus : on marque le membre rejected sans toucher aux compteurs
                transaction.update(memberRef, {
                    status: 'rejected',
                    rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
                    rejectedBy: callerUid,
                });

                // Notification de refus pour le membre
                const notif = buildNotificationDoc(memberUid, {
                    title: 'Demande refusée',
                    body: `Votre demande a été refusée pour ${tontine.name}`,
                    type: 'join_rejected',
                    tontineId,
                    tontineName: tontine.name,
                    senderUid: callerUid,
                });

                transaction.set(notif.ref, notif.data);
                await sendNotificationToUser(memberUid, notif.data);
            }
        });

        return res.json({
            success: true,
            message: action === 'accept'
                ? tontineAutoStarted
                    ? 'Membre accepté — la tontine est maintenant complète et a démarré automatiquement !'
                    : 'Membre accepté avec succès'
                : 'Membre refusé',
            data: {
                memberUid,
                newStatus: action === 'accept' ? 'active' : 'rejected',
                tontineAutoStarted,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// GET /api/v1/tontines/:id/members/:uid
export const getMemberProfile = async (req: Request, res: Response) => {
    const callerUid = (req as any).user.uid;
    const { id, uid } = req.params;

    if (!id || typeof id !== 'string') return res.status(400).json({ success: false, error: 'ID tontine requis' });
    if (!uid || typeof uid !== 'string') return res.status(400).json({ success: false, error: 'UID membre requis' });

    try {
        // Vérifier que caller est membre
        const callerDoc = await db
            .collection('tontines').doc(id)
            .collection('members').doc(callerUid)
            .get();

        if (!callerDoc.exists) {
            return res.status(403).json({
                success: false,
                error: "Accès refusé",
            });
        }

        // Récupérer le membre cible
        const memberDoc = await db
            .collection('tontines').doc(id)
            .collection('members').doc(uid)
            .get();

        if (!memberDoc.exists) {
            return res.status(404).json({
                success: false,
                error: "Membre introuvable",
            });
        }

        return res.json({
            success: true,
            data: {
                id: memberDoc.id,
                ...memberDoc.data(),
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/tontines/:id/next-turn
//
// Passe au tour suivant :
//   - Vérifie que le tour actuel est bien payé
//   - Sélectionne le prochain bénéficiaire (selon rotationMethod)
//   - Pour 'random' sans assignation préalable : tire au sort parmi les éligibles
//   - Pour 'consensual' : ouvre un vote
//   - Met à jour currentTurn + nextBeneficiaryUid
// ─────────────────────────────────────────────────────────────
export const processNextTurn = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    const callerUid = (req as any).user.uid;
    const { id: tontineId } = req.params;

    try {
        const tontineRef = db.collection('tontines').doc(tontineId);
        const tontineDoc = await tontineRef.get();

        if (!tontineDoc.exists)
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });

        const tontine = tontineDoc.data()!;

        // Vérifier les droits
        const callerDoc = await db
            .collection('tontines').doc(tontineId)
            .collection('members').doc(callerUid).get();

        if (!callerDoc.exists || !['creator', 'admin'].includes(callerDoc.data()?.role)) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        if (tontine.status !== 'active')
            return res.status(400).json({ success: false, error: 'La tontine n\'est pas active' });

        if (tontine.currentTurn >= tontine.totalTurns)
            return res.status(400).json({ success: false, error: 'Tous les tours sont terminés' });

        // Récupérer les membres actifs
        const membersSnap = await db
            .collection('tontines').doc(tontineId)
            .collection('members')
            .where('status', '==', 'active')
            .get();

        const allMembers = membersSnap.docs.map(doc => ({
            uid: doc.id,
            ...doc.data() as any,
        }));

        // Membres éligibles = ceux qui n'ont pas encore eu leur tour
        // Un membre "a eu son tour" si son uid est dans tontine.completedTurns[]
        const completedTurns: string[] = tontine.completedTurns ?? [];
        const eligibleMembers = allMembers.filter(m => !completedTurns.includes(m.uid));

        if (eligibleMembers.length === 0) {
            return res.status(400).json({ success: false, error: 'Tous les membres ont déjà eu leur tour' });
        }

        const nextTurn = (tontine.currentTurn ?? 0) + 1;
        let nextBeneficiary: any = null;

        switch (tontine.rotationMethod) {

            case 'random': {
                // Si les tours ont été pré-assignés, on suit l'ordre turnOrder[]
                if (tontine.turnOrder?.length > 0) {
                    const nextUid = tontine.turnOrder[nextTurn - 1];
                    nextBeneficiary = allMembers.find(m => m.uid === nextUid) ?? null;
                } else {
                    // Le créateur est prioritaire s'il est encore éligible,
                    // sinon tirage aléatoire parmi les éligibles
                    const creatorEligible = eligibleMembers.find(m => m.uid === tontine.createdBy);
                    if (creatorEligible) {
                        nextBeneficiary = creatorEligible;
                    } else {
                        const idx = Math.floor(Math.random() * eligibleMembers.length);
                        nextBeneficiary = eligibleMembers[idx];
                    }
                }
                break;
            }

            case 'seniority': {
                // Suivre l'ordre pré-assigné dans turnOrder[]
                const nextUid = tontine.turnOrder?.[nextTurn - 1];
                nextBeneficiary = allMembers.find(m => m.uid === nextUid) ?? null;
                break;
            }

            case 'manual': {
                // Le créateur doit passer nextBeneficiaryUid dans le body
                const { nextBeneficiaryUid } = req.body;
                if (!nextBeneficiaryUid)
                    return res.status(400).json({
                        success: false,
                        error: 'nextBeneficiaryUid requis pour la rotation manuelle',
                    });

                const isEligible = eligibleMembers.find(m => m.uid === nextBeneficiaryUid);
                if (!isEligible)
                    return res.status(400).json({
                        success: false,
                        error: 'Cet utilisateur n\'est pas éligible (déjà eu son tour ou non membre)',
                    });

                nextBeneficiary = isEligible;
                break;
            }

            case 'consensual': {
                // Ouvrir un vote — le vrai bénéficiaire sera défini après vote
                // On crée un document vote et on retourne en attente
                const voteRef = db.collection('tontines').doc(tontineId)
                    .collection('votes').doc();

                await voteRef.set({
                    id: voteRef.id,
                    type: 'next_turn_selection',
                    turn: nextTurn,
                    status: 'open',
                    candidates: eligibleMembers.map(m => m.uid),
                    votes: {},          // { uid: votedForUid }
                    result: null,
                    requiredThreshold: tontine.rules?.consensusThreshold ?? 75,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    closedAt: null,
                });

                // Notifier tous les membres pour voter
                const batch = db.batch();
                for (const m of allMembers) {
                    const notif = buildNotificationDoc(m.uid, {
                        title: 'Vote pour le prochain bénéficiaire',
                        body: `C'est à vous de voter pour le bénéficiaire du tour ${nextTurn} de ${tontine.name}`,
                        type: 'vote_next_turn',
                        tontineId,
                        tontineName: tontine.name,
                        turn: nextTurn,
                    });
                    batch.set(notif.ref, notif.data);
                    await sendNotificationToUser(m.uid, notif.data);
                }
                await batch.commit();

                return res.json({
                    success: true,
                    message: 'Vote ouvert — les membres doivent voter pour le prochain bénéficiaire',
                    data: { voteId: voteRef.id, turn: nextTurn, status: 'vote_pending' },
                });
            }
        }

        if (!nextBeneficiary)
            return res.status(500).json({ success: false, error: 'Impossible de déterminer le prochain bénéficiaire' });

        // Mettre à jour la tontine
        await db.runTransaction(async (transaction) => {
            transaction.update(tontineRef, {
                currentTurn: nextTurn,
                currentBeneficiaryUid: nextBeneficiary.uid,
                completedTurns: admin.firestore.FieldValue.arrayUnion(nextBeneficiary.uid),
                lastTurnStartedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Marquer le membre comme ayant reçu son tour
            const memberRef = db.collection('tontines').doc(tontineId)
                .collection('members').doc(nextBeneficiary.uid);
            transaction.update(memberRef, {
                turnReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
                'stats.totalReceived': admin.firestore.FieldValue.increment(tontine.potPerTurn),
            });

            // Notification au bénéficiaire
            const notif = buildNotificationDoc(nextBeneficiary.uid, {
                title: "C'est votre tour 🎉",
                body: `Vous recevez ${tontine.potPerTurn} FCFA`,
                type: 'turn_received',
                tontineId,
                tontineName: tontine.name,
                amount: tontine.potPerTurn,
                turn: nextTurn,
            });

            transaction.set(notif.ref, notif.data);
        });

        // Si dernier tour : clore la tontine
        if (nextTurn >= tontine.totalTurns) {
            await tontineRef.update({
                status: 'completed',
                endedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        return res.json({
            success: true,
            message: `Tour ${nextTurn} attribué à ${nextBeneficiary.userName ?? nextBeneficiary.uid}`,
            data: {
                turn: nextTurn,
                beneficiaryUid: nextBeneficiary.uid,
                beneficiaryName: nextBeneficiary.userName,
                potAmount: tontine.potPerTurn,
                tontineCompleted: nextTurn >= tontine.totalTurns,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/tontines/:id/votes/:voteId/cast
//
// Un membre vote pour un candidat (mode consensuel)
// Quand le seuil est atteint → bénéficiaire automatiquement assigné
// ─────────────────────────────────────────────────────────────
export const castVote = async (
    req: Request<{ id: string; voteId: string }>,
    res: Response
) => {
    const voterUid = (req as any).user.uid;
    const { id: tontineId, voteId } = req.params;
    const { candidateUid } = req.body;

    if (!candidateUid)
        return res.status(400).json({ success: false, error: 'candidateUid requis' });

    try {
        const tontineRef = db.collection('tontines').doc(tontineId);
        const voteRef = tontineRef.collection('votes').doc(voteId);
        const voteDoc = await voteRef.get();

        if (!voteDoc.exists)
            return res.status(404).json({ success: false, error: 'Vote introuvable' });

        const vote = voteDoc.data()!;

        if (vote.status !== 'open')
            return res.status(400).json({ success: false, error: 'Ce vote est déjà clôturé' });

        // Vérifier que le votant est membre actif
        const voterDoc = await tontineRef.collection('members').doc(voterUid).get();
        if (!voterDoc.exists || voterDoc.data()?.status !== 'active')
            return res.status(403).json({ success: false, error: 'Accès refusé' });

        // Vérifier que le candidat est éligible
        if (!vote.candidates.includes(candidateUid))
            return res.status(400).json({ success: false, error: 'Ce candidat n\'est pas éligible' });

        // Enregistrer le vote
        const updatedVotes = { ...vote.votes, [voterUid]: candidateUid };

        // Compter les votes par candidat
        const voteCounts: Record<string, number> = {};
        for (const v of Object.values(updatedVotes) as string[]) {
            voteCounts[v] = (voteCounts[v] ?? 0) + 1;
        }

        const totalVoters = (await tontineRef.collection('members')
            .where('status', '==', 'active').get()).size;

        const threshold = vote.requiredThreshold / 100;

        // Vérifier si un candidat a atteint le seuil
        let winner: string | null = null;
        for (const [uid, count] of Object.entries(voteCounts)) {
            if (count / totalVoters >= threshold) {
                winner = uid;
                break;
            }
        }

        await db.runTransaction(async (transaction) => {
            // Enregistrer le vote du membre
            transaction.update(voteRef, {
                [`votes.${voterUid}`]: candidateUid,
                voteCounts,
            });

            if (winner) {
                const tontineDoc = await tontineRef.get();
                const tontine = tontineDoc.data()!;
                const nextTurn = (tontine.currentTurn ?? 0) + 1;

                // Clore le vote
                transaction.update(voteRef, {
                    status: 'closed',
                    result: winner,
                    closedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Mettre à jour la tontine
                transaction.update(tontineRef, {
                    currentTurn: nextTurn,
                    currentBeneficiaryUid: winner,
                    completedTurns: admin.firestore.FieldValue.arrayUnion(winner),
                    lastTurnStartedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Notifier le gagnant
                const notif = buildNotificationDoc(winner, {
                    title: 'Vous avez été choisi',
                    body: `Vous recevez le tour ${nextTurn}`,
                    type: 'turn_received',
                    tontineId,
                    tontineName: tontine.name,
                    amount: tontine.potPerTurn,
                    turn: nextTurn,
                });

                transaction.set(notif.ref, notif.data);
            }
        });

        return res.json({
            success: true,
            message: winner
                ? `Vote clôturé — bénéficiaire désigné`
                : 'Vote enregistré — en attente du seuil',
            data: {
                voteCounts,
                winner: winner ?? null,
                votesRemaining: winner ? 0 : totalVoters - Object.keys(updatedVotes).length,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/tontines/:id/launch
//
// Passe la tontine de 'pending' → 'active'
// + assigne les tours selon rotationMethod
// + définit le 1er bénéficiaire
// ─────────────────────────────────────────────────────────────
export const launchTontine = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    const callerUid = (req as any).user.uid;
    const { id: tontineId } = req.params;
    const { nextBeneficiaryUid } = req.body; // requis si rotationMethod === 'manual'

    try {
        const tontineRef = db.collection('tontines').doc(tontineId);
        const tontineDoc = await tontineRef.get();

        if (!tontineDoc.exists)
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });

        const tontine = tontineDoc.data()!;

        // ── Vérifications ──────────────────────────────────────────────────────

        if (tontine.createdBy !== callerUid)
            return res.status(403).json({ success: false, error: 'Seul le créateur peut lancer la tontine' });

        if (tontine.status !== 'pending')
            return res.status(400).json({
                success: false,
                error: tontine.status === 'active'
                    ? 'La tontine est déjà active'
                    : 'Impossible de lancer cette tontine',
            });

        if (tontine.currentMembers < tontine.totalMembers)
            return res.status(400).json({
                success: false,
                error: `Il manque ${tontine.totalMembers - tontine.currentMembers} membre(s) pour lancer la tontine`,
            });

        // ── Récupérer les membres actifs ───────────────────────────────────────
        const membersSnap = await db
            .collection('tontines').doc(tontineId)
            .collection('members')
            .where('status', '==', 'active')
            .get();

        const members = membersSnap.docs.map(doc => ({
            ref: doc.ref,
            uid: doc.id,
            joinedAt: doc.data().joinedAt?.toMillis?.() ?? 0,
            userName: doc.data().userName ?? doc.id,
        }));

        // ── Calculer l'ordre selon rotationMethod ──────────────────────────────
        let orderedMembers: typeof members;

        switch (tontine.rotationMethod) {

            case 'random': {
                // Le créateur passe en premier, Fisher-Yates sur le reste
                const creatorMember = members.find(m => m.uid === tontine.createdBy) ?? null;
                const rest = members.filter(m => m.uid !== creatorMember?.uid);

                for (let i = rest.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const temp = rest[i];
                    if (temp && rest[j]) {
                        rest[i] = rest[j];
                        rest[j] = temp;
                    }
                }

                orderedMembers = creatorMember ? [creatorMember, ...rest] : rest;
                break;
            }

            case 'seniority': {
                orderedMembers = [...members].sort((a, b) => a.joinedAt - b.joinedAt);
                break;
            }

            case 'manual': {
                if (!nextBeneficiaryUid)
                    return res.status(400).json({
                        success: false,
                        error: 'nextBeneficiaryUid requis pour la rotation manuelle',
                    });

                const first = members.find(m => m.uid === nextBeneficiaryUid);
                if (!first)
                    return res.status(400).json({
                        success: false,
                        error: 'Bénéficiaire introuvable parmi les membres actifs',
                    });

                // Le bénéficiaire choisi passe en 1er, le reste dans l'ordre d'adhésion
                const rest = members
                    .filter(m => m.uid !== nextBeneficiaryUid)
                    .sort((a, b) => a.joinedAt - b.joinedAt);
                orderedMembers = [first, ...rest];
                break;
            }

            case 'consensual': {
                // Pas de tirage : on ouvre un vote pour le tour 1
                // La tontine passe quand même active, turnNumber = null pour tous
                const voteRef = db.collection('tontines').doc(tontineId)
                    .collection('votes').doc();

                await db.runTransaction(async (transaction) => {
                    // Passer active
                    transaction.update(tontineRef, {
                        status: 'active',
                        startedAt: admin.firestore.FieldValue.serverTimestamp(),
                        currentTurn: 0,
                        completedTurns: [],
                        turnOrder: [],
                    });

                    // turnNumber = null pour tous
                    for (const m of members) {
                        transaction.update(m.ref, { turnNumber: null });
                    }

                    // Créer le vote pour le tour 1
                    transaction.set(voteRef, {
                        id: voteRef.id,
                        type: 'next_turn_selection',
                        turn: 1,
                        status: 'open',
                        candidates: members.map(m => m.uid),
                        votes: {},
                        result: null,
                        requiredThreshold: tontine.rules?.consensusThreshold ?? 75,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        closedAt: null,
                    });

                    // Notifier tous les membres
                    for (const m of members) {
                        const notifRef = db.collection('notifications').doc();
                        transaction.set(notifRef, {
                            id: notifRef.id,
                            type: 'vote_open',
                            recipientUid: m.uid,
                            tontineId,
                            voteId: voteRef.id,
                            turn: 1,
                            tontineName: tontine.name,
                            read: false,
                            createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    }
                });

                return res.json({
                    success: true,
                    message: 'Tontine lancée — vote ouvert pour le tour 1',
                    data: { tontineId, status: 'active', voteId: voteRef.id, rotationMethod: 'consensual' },
                });
            }

            default:
                orderedMembers = members;
        }

        // ── Transaction : activer + assigner les tours ─────────────────────────

        const firstBeneficiary = orderedMembers[0];
        if (firstBeneficiary === undefined) {
            return res.status(400).json({ success: false, error: 'Aucun membre trouvé pour attribuer le premier tour' });
        }
        const turnOrder = orderedMembers.map(m => m.uid);

        await db.runTransaction(async (transaction) => {

            // 1. Passer la tontine active
            transaction.update(tontineRef, {
                status: 'active',
                startedAt: admin.firestore.FieldValue.serverTimestamp(),
                currentTurn: 1,
                currentBeneficiaryUid: firstBeneficiary.uid,
                completedTurns: [firstBeneficiary.uid],
                turnOrder,
                lastTurnStartedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 2. Assigner les turnNumber à chaque membre
            orderedMembers.forEach((m, index) => {
                transaction.update(m.ref, { turnNumber: index + 1 });
            });

            // 3. Marquer le 1er bénéficiaire
            transaction.update(firstBeneficiary.ref, {
                turnReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
                'stats.totalReceived': admin.firestore.FieldValue.increment(tontine.potPerTurn),
            });

            // 4. Notification au 1er bénéficiaire
            const notif = buildNotificationDoc(firstBeneficiary.uid, {
                title: 'Tour 1 attribué',
                body: `Vous recevez ${tontine.potPerTurn} FCFA`,
                type: 'turn_received',
                tontineId,
                tontineName: tontine.name,
                amount: tontine.potPerTurn,
                turn: 1,
            });

            transaction.set(notif.ref, notif.data);
            await sendNotificationToUser(firstBeneficiary.uid, notif.data);

            // 5. Notifier tous les autres membres que la tontine a démarré
            for (const m of members) {
                if (m.uid === firstBeneficiary.uid) continue;
                const notifRef2 = db.collection('notifications').doc();
                transaction.set(notifRef2, {
                    id: notifRef2.id,
                    type: 'tontine_started',
                    recipientUid: m.uid,
                    tontineId,
                    tontineName: tontine.name,
                    read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
        });

        return res.json({
            success: true,
            message: `Tontine lancée ! Tour 1 attribué à ${firstBeneficiary.userName}`,
            data: {
                tontineId,
                status: 'active',
                rotationMethod: tontine.rotationMethod,
                turnOrder,
                currentTurn: 1,
                firstBeneficiary: {
                    uid: firstBeneficiary.uid,
                    name: firstBeneficiary.userName,
                    turnNumber: 1,
                },
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};