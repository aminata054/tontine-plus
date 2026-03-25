import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';

// ─────────────────────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────────────────────

// Générer un code d'invitation unique (ex: ABC123)
const generateInviteCode = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join('');
};

// Calculer la date du prochain paiement selon la fréquence
const getNextPaymentDate = (
    frequency: string,
    paymentDay?: number
): Date => {
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
            const next = new Date(now.getFullYear(), now.getMonth() + 1, paymentDay ?? 1);
            return next;
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/tontines — CRÉER UNE TONTINE
// Reçoit le body complet depuis l'écran 7 (Récapitulatif)
// ─────────────────────────────────────────────────────────────
export const createTontine = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    const {
        // Écran 1 — Type
        type,                    // 'rotative' | 'crescendo' | 'epargne' | 'solidarite'

        // Écran 2 — Infos de base
        name,
        description,
        emoji,
        visibility,              // 'private' | 'semi_public'

        // Écran 3 — Paramètres financiers
        amount,                  // montant en FCFA
        frequency,               // 'daily' | 'weekly' | 'biweekly' | 'monthly'
        paymentDay,              // jour de la semaine (0-6) ou du mois (1-31)
        totalMembers,            // nombre de membres

        // Écran 4 — Ordre de rotation
        rotationMethod,          // 'random' | 'seniority' | 'consensual' | 'manual'

        // Écran 5 — Règles et pénalités
        gracePeriodDays,         // 0 | 2 | 3 | 5 | 7
        penaltyType,             // 'percentage' | 'fixed'
        penaltyValue,            // % ou montant FCFA
        autoExclusionDays,       // 7 | 14 | 30 | null (jamais)
        earlyExitAllowed,        // 'with_penalty' | 'majority_vote' | 'never'
        earlyExitPenaltyType,    // 'lose_guarantee' | 'lose_contributions' | 'other'
        modificationRule,        // '75_approval' | 'immutable'

        // Écran 6 — Sécurité
        securityModel,           // 'escrow' | 'direct' | 'blocked' | 'solidarity'
        guaranteeAmount,         // si solidarity : montant de la caution
    } = req.body;

    // ── Validation des champs obligatoires ───────────────────
    const errors: string[] = [];

    if (!['rotative', 'crescendo', 'epargne', 'solidarite'].includes(type))
        errors.push('type invalide');

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

    if (!['escrow', 'direct', 'blocked', 'solidarity'].includes(securityModel))
        errors.push('modèle de sécurité invalide');

    if (securityModel === 'solidarity' && (!guaranteeAmount || guaranteeAmount < 0))
        errors.push('montant de caution requis pour le modèle solidarité');

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    // ── Création dans Firestore (transaction atomique) ────────
    let tontineId: string | null = null;

    try {
        const tontineRef = db.collection('tontines').doc();
        tontineId = tontineRef.id;

        // Générer un code d'invitation unique
        let inviteCode = generateInviteCode();

        // S'assurer de l'unicité du code
        const existing = await db
            .collection('tontines')
            .where('inviteCode', '==', inviteCode)
            .get();
        if (!existing.empty) inviteCode = generateInviteCode() + '1';

        const nextPaymentDate = getNextPaymentDate(frequency, paymentDay);

        // Utiliser une transaction pour créer la tontine ET ajouter le créateur comme membre
        await db.runTransaction(async (transaction) => {

            // 1. Document principal de la tontine
            transaction.set(tontineRef, {
                // Infos générales
                name: name.trim(),
                description: description?.trim() || null,
                emoji: emoji || null,
                type,
                visibility: visibility || 'private',
                status: 'pending',              // devient 'active' quand tous les membres sont là

                // Paramètres financiers
                amount: Number(amount),
                currency: 'XOF',
                frequency,
                paymentDay: paymentDay || null,
                totalMembers: Number(totalMembers),
                currentMembers: 1,             // le créateur est le premier membre
                potPerTurn: Number(amount) * Number(totalMembers),

                // Rotation
                rotationMethod,
                currentTurn: 0,               // démarre à 0 tant que pending

                // Sécurité
                securityModel,
                guaranteeAmount: securityModel === 'solidarity' ? Number(guaranteeAmount) : null,

                // Invitation
                inviteCode,
                inviteLink: `https://tontineplus.app/join/${inviteCode}`,

                // Méta
                createdBy: uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                nextPaymentDate: admin.firestore.Timestamp.fromDate(nextPaymentDate),
                startedAt: null,
                endedAt: null,
            });

            // 2. Sous-collection rules/ (écran 5)
            const rulesRef = tontineRef.collection('rules').doc('main');
            transaction.set(rulesRef, {
                gracePeriodDays: Number(gracePeriodDays ?? 0),
                penaltyType: penaltyType || 'percentage',
                penaltyValue: Number(penaltyValue ?? 0),
                autoExclusionDays: autoExclusionDays ? Number(autoExclusionDays) : null,
                earlyExitAllowed: earlyExitAllowed || 'never',
                earlyExitPenaltyType: earlyExitPenaltyType || null,
                rulesLocked: modificationRule === 'immutable',
                modificationThreshold: modificationRule === 'immutable' ? 100 : 75,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastModifiedBy: uid,
                lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 3. Sous-collection members/ — le créateur est ajouté automatiquement
            const memberRef = tontineRef.collection('members').doc(uid);
            transaction.set(memberRef, {
                role: 'creator',
                status: 'active',
                turnNumber: null,          // assigné après le tirage au sort
                hasReceivedTurn: false,
                validationCount: 0,
                paidTurns: 0,
                lateTurns: 0,
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                validatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });

        // Réponse succès — correspond à l'écran "Réussite création"
        return res.status(201).json({
            success: true,
            message: 'Tontine créée avec succès',
            data: {
                tontineId,
                inviteCode,
                inviteLink: `https://tontineplus.app/join/${inviteCode}`,
                potPerTurn: Number(amount) * Number(totalMembers),
                status: 'pending',
            },
        });

    } catch (err: any) {
        // Rollback : si la transaction a partiellement écrit, nettoyer
        if (tontineId) {
            try {
                await db.collection('tontines').doc(tontineId).delete();
            } catch (_) { }
        }

        // Réponse erreur — correspond à l'écran "Échec création"
        return res.status(500).json({
            success: false,
            error: 'Une erreur est survenue lors de la création. Veuillez réessayer.',
            detail: err.message,
        });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/tontines — MES TONTINES
// ─────────────────────────────────────────────────────────────
export const getMyTontines = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { status } = req.query; // filtre optionnel : pending | active | completed

    try {
        // Récupérer les IDs des tontines où l'user est membre
        const membershipsSnap = await db
            .collectionGroup('members')
            .where(admin.firestore.FieldPath.documentId(), '==', uid)
            .get();

        if (membershipsSnap.empty) {
            return res.json({ success: true, data: [], count: 0 });
        }

        // Récupérer les documents tontines correspondants
        const tontineIds = membershipsSnap.docs.map(
            (d) => d.ref.parent.parent!.id
        );

        // Firestore limite les 'in' à 30 éléments
        const chunks: string[][] = [];
        for (let i = 0; i < tontineIds.length; i += 30) {
            chunks.push(tontineIds.slice(i, i + 30));
        }

        const tontines: any[] = [];
        for (const chunk of chunks) {
            let query = db
                .collection('tontines')
                .where(admin.firestore.FieldPath.documentId(), 'in', chunk);

            if (status) query = query.where('status', '==', status) as any;

            const snap = await query.get();
            snap.docs.forEach((doc) => {
                tontines.push({ id: doc.id, ...doc.data() });
            });
        }

        return res.json({ success: true, data: tontines, count: tontines.length });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/tontines/:id — DÉTAILS D'UNE TONTINE
// ─────────────────────────────────────────────────────────────
export const getTontineById = async (req: Request<{ id: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({
            success: false,
            error: 'ID requis',
        });
    }

    try {
        const tontineDoc = await db.collection('tontines').doc(id).get();

        if (!tontineDoc.exists) {
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });
        }

        // Vérifier que l'utilisateur est bien membre
        const memberDoc = await db
            .collection('tontines').doc(id)
            .collection('members').doc(uid)
            .get();

        if (!memberDoc.exists) {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé — vous n\'êtes pas membre de cette tontine',
            });
        }

        // Récupérer les règles
        const rulesDoc = await db
            .collection('tontines').doc(id)
            .collection('rules').doc('main')
            .get();

        return res.json({
            success: true,
            data: {
                id: tontineDoc.id,
                ...tontineDoc.data(),
                rules: rulesDoc.exists ? rulesDoc.data() : null,
                myRole: memberDoc.data()?.role,
                myTurnNumber: memberDoc.data()?.turnNumber,
            },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/tontines/:id — MODIFIER UNE TONTINE
// Seul le créateur peut modifier, et uniquement si status='pending'
// ─────────────────────────────────────────────────────────────
export const updateTontine = async (req: Request<{ id: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({
            success: false,
            error: 'ID requis',
        });
    }


    // Champs modifiables (on n'autorise pas de changer type/sécurité après création)
    const ALLOWED_FIELDS = [
        'name', 'description', 'emoji', 'visibility',
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

        // Filtrer uniquement les champs autorisés
        const updates: Record<string, any> = {};
        ALLOWED_FIELDS.forEach((field) => {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        });

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'Aucun champ valide à mettre à jour' });
        }

        // Recalculer le pot si amount ou totalMembers change
        const newAmount = updates.amount ?? tontine.amount;
        const newTotal = updates.totalMembers ?? tontine.totalMembers;
        updates.potPerTurn = Number(newAmount) * Number(newTotal);
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
// Uniquement possible si status='pending' (pas encore démarrée)
// ─────────────────────────────────────────────────────────────
export const deleteTontine = async (req: Request<{ id: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({
            success: false,
            error: 'ID requis',
        });
    }

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

        // Supprimer les sous-collections d'abord (Firestore ne les supprime pas automatiquement)
        const batch = db.batch();

        const subcollections = ['members', 'rules', 'chat'];
        for (const sub of subcollections) {
            const snap = await db.collection('tontines').doc(id).collection(sub).get();
            snap.docs.forEach((doc) => batch.delete(doc.ref));
        }

        // Supprimer le document principal
        batch.delete(db.collection('tontines').doc(id));
        await batch.commit();

        return res.json({
            success: true,
            message: 'Tontine supprimée avec succès',
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/tontines/:id/invite — LIEN + QR CODE
// Correspond à l'écran "Partage lien" et "Partage QR Code"
// ─────────────────────────────────────────────────────────────
export const getTontineInvite = async (req: Request<{ id: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({
            success: false,
            error: 'ID requis',
        });
    }


    try {
        const tontineDoc = await db.collection('tontines').doc(id).get();

        if (!tontineDoc.exists) {
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });
        }

        const tontine = tontineDoc.data()!;

        // Vérifier que c'est bien le créateur ou un validateur
        const memberDoc = await db
            .collection('tontines').doc(id)
            .collection('members').doc(uid).get();

        if (!memberDoc.exists) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        const inviteLink = `https://tontineplus.app/join/${tontine.inviteCode}`;

        // URL du QR code généré via l'API Google Charts (gratuit, pas de clé requise)
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(inviteLink)}`;

        return res.json({
            success: true,
            data: {
                inviteCode: tontine.inviteCode,
                inviteLink,
                qrCodeUrl,
                tontineName: tontine.name,
                membersCount: `${tontine.currentMembers}/${tontine.totalMembers}`,
            },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};