import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { buildNotificationDoc, sendNotificationToUser } from '../services/notification.service';
import {
    VoteType,
    VoteStatus,
    VoteResult,
    TontineVote,
    RuleChangeMeta,
    MemberExclusionMeta,
    RoleChangeMeta,
    TurnSwapMeta,
    EarlyDissolutionMeta,
} from '../types/vote.type';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seuil de participation requis (%) pour chaque type de vote.
 * Le résultat est calculé sur les votants / membres éligibles.
 */
const THRESHOLDS: Record<VoteType, number> = {
    next_turn_selection: 50,
    rule_change: 50,
    member_exclusion: 50,
    early_dissolution: 100,
    role_change: 51,
    turn_swap: 51,
};

/**
 * Rôles autorisés à CRÉER chaque type de vote.
 * 'any' = tout membre actif peut proposer.
 */
const ALLOWED_CREATORS: Record<VoteType, string[] | 'any'> = {
    next_turn_selection: ['creator', 'admin'],
    rule_change: 'any',
    member_exclusion: ['creator', 'admin'],
    early_dissolution: 'any',
    role_change: ['creator'],
    turn_swap: 'any',
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────────────────────────────────────

const assertActiveMember = async (tontineId: string, uid: string) => {
    const doc = await db
        .collection('tontines').doc(tontineId)
        .collection('members').doc(uid)
        .get();
    if (!doc.exists) return null;
    const data = doc.data()!;
    if (data.status !== 'active') return null;
    return { role: data.role as string, turnNumber: data.turnNumber as number | null };
};

/**
 * Récupère tous les membres actifs d'une tontine.
 */
const getActiveMembers = async (tontineId: string) => {
    const snap = await db
        .collection('tontines').doc(tontineId)
        .collection('members')
        .where('status', '==', 'active')
        .get();
    return snap.docs.map(d => ({ uid: d.id, ...d.data() as any }));
};

/**
 * Calcule les résultats du vote et détermine s'il y a un gagnant.
 * Pour next_turn_selection : gagnant = candidat avec >= threshold% des voix.
 * Pour les autres : approuvé si 'yes' >= threshold% des éligibles.
 */
const computeResult = (
    votes: Record<string, string>,
    candidates: string[],
    eligibleCount: number,
    threshold: number,
    type: VoteType,
): {
    voteCounts: Record<string, number>;
    winner: string | null;
    result: VoteResult | null;
    quorumReached: boolean;
} => {
    const voteCounts: Record<string, number> = {};
    for (const c of candidates) voteCounts[c] = 0;
    for (const choice of Object.values(votes)) {
        voteCounts[choice] = (voteCounts[choice] ?? 0) + 1;
    }

    const totalVotes = Object.keys(votes).length;
    const participationRate = eligibleCount > 0 ? (totalVotes / eligibleCount) * 100 : 0;
    const quorumReached = participationRate >= threshold;

    if (!quorumReached) {
        return { voteCounts, winner: null, result: null, quorumReached };
    }

    if (type === 'next_turn_selection') {
        // Le gagnant est le candidat ayant le plus de voix (parmi ceux >= threshold%)
        let winner: string | null = null;
        let maxVotes = 0;
        for (const [uid, count] of Object.entries(voteCounts)) {
            if (count > maxVotes) {
                maxVotes = count;
                winner = uid;
            }
        }
        const winnerRate = eligibleCount > 0 ? (maxVotes / eligibleCount) * 100 : 0;
        if (winnerRate >= threshold) {
            return { voteCounts, winner, result: 'approved', quorumReached };
        }
        return { voteCounts, winner: null, result: null, quorumReached };
    }

    // Pour tous les autres types : yes/no
    const yesCount = voteCounts['yes'] ?? 0;
    const yesRate = eligibleCount > 0 ? (yesCount / eligibleCount) * 100 : 0;
    const result: VoteResult = yesRate >= threshold ? 'approved' : 'rejected';
    return { voteCounts, winner: null, result, quorumReached };
};

// ─────────────────────────────────────────────────────────────────────────────
// EFFETS SECONDAIRES, Appliquer le résultat d'un vote approuvé
// ─────────────────────────────────────────────────────────────────────────────

const applyVoteEffect = async (
    vote: TontineVote,
    tontineId: string,
    transaction: FirebaseFirestore.Transaction,
): Promise<void> => {
    const tontineRef = db.collection('tontines').doc(tontineId);

    switch (vote.type) {

        // ── Changement de règle ──────────────────────────────────────────────────
        case 'rule_change': {
            const meta = vote.meta as RuleChangeMeta;
            // Le champ peut être imbriqué ex: 'rules.gracePeriodDays'
            transaction.update(tontineRef, {
                [meta.field]: meta.proposedValue,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            break;
        }

        // ── Exclusion de membre ──────────────────────────────────────────────────
        case 'member_exclusion': {
            const meta = vote.meta as MemberExclusionMeta;
            const memberRef = tontineRef.collection('members').doc(meta.targetUid);

            transaction.update(memberRef, {
                status: 'excluded',
                excludedAt: admin.firestore.FieldValue.serverTimestamp(),
                excludedReason: meta.reason,
            });

            // Retirer l'ID de tontine du profil utilisateur
            transaction.update(db.collection('users').doc(meta.targetUid), {
                tontineIds: admin.firestore.FieldValue.arrayRemove(tontineId),
            });

            // Décrémenter le compteur de membres
            transaction.update(tontineRef, {
                currentMembers: admin.firestore.FieldValue.increment(-1),
            });
            break;
        }

        // ── Changement de rôle ───────────────────────────────────────────────────
        case 'role_change': {
            const meta = vote.meta as RoleChangeMeta;
            const memberRef = tontineRef.collection('members').doc(meta.targetUid);
            transaction.update(memberRef, { role: meta.proposedRole });
            break;
        }

        // ── Échange de tours ─────────────────────────────────────────────────────
        case 'turn_swap': {
            const meta = vote.meta as TurnSwapMeta;
            const ref1 = tontineRef.collection('members').doc(meta.uid1);
            const ref2 = tontineRef.collection('members').doc(meta.uid2);

            // Échanger les turnNumber
            transaction.update(ref1, { turnNumber: meta.turn2 });
            transaction.update(ref2, { turnNumber: meta.turn1 });

            // Mettre à jour turnOrder sur la tontine
            // Note : nécessite de lire turnOrder avant, mais on le passe via meta ou on le relit
            // Ici on fait une mise à jour positionnelle simple
            const tontineDoc = await tontineRef.get();
            const turnOrder: string[] = tontineDoc.data()?.turnOrder ?? [];
            const idx1 = turnOrder.indexOf(meta.uid1);
            const idx2 = turnOrder.indexOf(meta.uid2);
            if (idx1 !== -1 && idx2 !== -1) {
                [turnOrder[idx1], turnOrder[idx2]] = [turnOrder[idx2]!, turnOrder[idx1]!];
                transaction.update(tontineRef, { turnOrder });
            }
            break;
        }

        // ── Dissolution anticipée ────────────────────────────────────────────────
        case 'early_dissolution': {
            transaction.update(tontineRef, {
                status: 'cancelled',
                endedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            break;
        }

        // next_turn_selection : traité dans castVote directement (winner → currentBeneficiary)
        default:
            break;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/tontines/:id/votes
// Créer un vote
// ─────────────────────────────────────────────────────────────────────────────
export const createVote = async (
    req: Request<{ id: string }>,
    res: Response,
) => {
    const callerUid = (req as any).user.uid;
    const { id: tontineId } = req.params;
    const { type, title, description, expiresInHours, meta } = req.body;

    // ── Validation basique ───────────────────────────────────────────────────
    const VALID_TYPES: VoteType[] = [
        'next_turn_selection', 'rule_change', 'member_exclusion',
        'early_dissolution', 'role_change', 'turn_swap',
    ];

    const errors: string[] = [];
    if (!type || !VALID_TYPES.includes(type))
        errors.push(`type invalide, valeurs acceptées : ${VALID_TYPES.join(' | ')}`);
    if (!title || title.trim().length < 5)
        errors.push('title requis (minimum 5 caractères)');

    if (errors.length > 0)
        return res.status(400).json({ success: false, errors });

    try {
        const tontineDoc = await db.collection('tontines').doc(tontineId).get();
        if (!tontineDoc.exists)
            return res.status(404).json({ success: false, error: 'Tontine introuvable' });

        const tontine = tontineDoc.data()!;

        if (tontine.status !== 'active')
            return res.status(400).json({
                success: false,
                error: 'Les votes ne sont disponibles que sur une tontine active',
            });

        const member = await assertActiveMember(tontineId, callerUid);
        if (!member)
            return res.status(403).json({ success: false, error: 'Accès refusé, vous n\'êtes pas membre actif' });

        // ── Vérifier que le créateur a le bon rôle ───────────────────────────────
        const allowedRoles = ALLOWED_CREATORS[type as VoteType];
        if (allowedRoles !== 'any' && !allowedRoles.includes(member.role)) {
            return res.status(403).json({
                success: false,
                error: `Seul un ${allowedRoles.join(' ou ')} peut créer ce type de vote`,
            });
        }

        // ── Validations spécifiques par type ─────────────────────────────────────
        if (type === 'rule_change') {
            if (!meta?.field || meta.proposedValue === undefined)
                return res.status(400).json({
                    success: false,
                    error: 'rule_change requiert meta.field et meta.proposedValue',
                });
        }

        if (type === 'member_exclusion') {
            if (!meta?.targetUid || !meta?.reason)
                return res.status(400).json({
                    success: false,
                    error: 'member_exclusion requiert meta.targetUid et meta.reason',
                });
            // Vérifier que la cible est bien membre actif
            const targetMember = await assertActiveMember(tontineId, meta.targetUid);
            if (!targetMember)
                return res.status(400).json({ success: false, error: 'Membre cible introuvable ou inactif' });
        }

        if (type === 'role_change') {
            if (!meta?.targetUid || !meta?.proposedRole)
                return res.status(400).json({
                    success: false,
                    error: 'role_change requiert meta.targetUid et meta.proposedRole',
                });
            if (!['admin', 'member'].includes(meta.proposedRole))
                return res.status(400).json({ success: false, error: 'proposedRole invalide : admin | member' });
        }

        if (type === 'turn_swap') {
            if (!meta?.uid1 || !meta?.uid2)
                return res.status(400).json({
                    success: false,
                    error: 'turn_swap requiert meta.uid1 et meta.uid2',
                });
            if (meta.uid1 === meta.uid2)
                return res.status(400).json({ success: false, error: 'Les deux membres doivent être différents' });
        }

        if (type === 'next_turn_selection' && tontine.rotationMethod !== 'consensual')
            return res.status(400).json({
                success: false,
                error: 'next_turn_selection uniquement disponible en mode rotation consensuelle',
            });

        // ── Vérifier qu'il n'y a pas déjà un vote ouvert du même type ───────────
        const existingOpen = await db
            .collection('tontines').doc(tontineId)
            .collection('votes')
            .where('type', '==', type)
            .where('status', '==', 'open')
            .limit(1)
            .get();

        if (!existingOpen.empty)
            return res.status(400).json({
                success: false,
                error: `Un vote de type "${type}" est déjà en cours`,
            });

        // ── Récupérer les membres éligibles ──────────────────────────────────────
        const activeMembers = await getActiveMembers(tontineId);
        const eligibleVoters = activeMembers.map(m => m.uid);

        // Pour turn_swap, les deux membres concernés doivent d'abord accepter.
        // On les liste comme candidats ; les autres votent yes/no.
        let candidates: string[];
        if (type === 'next_turn_selection') {
            // Membres qui n'ont pas encore eu leur tour
            const completedTurns: string[] = tontine.completedTurns ?? [];
            candidates = eligibleVoters.filter(uid => !completedTurns.includes(uid));
        } else {
            candidates = ['yes', 'no'];
        }

        // ── Expiration ───────────────────────────────────────────────────────────
        let expiresAt: admin.firestore.Timestamp | null = null;
        if (expiresInHours && Number(expiresInHours) > 0) {
            const exp = new Date();
            exp.setHours(exp.getHours() + Number(expiresInHours));
            expiresAt = admin.firestore.Timestamp.fromDate(exp);
        }

        // ── Créer le document vote ───────────────────────────────────────────────
        const voteRef = db.collection('tontines').doc(tontineId).collection('votes').doc();

        const voteData: Omit<TontineVote, 'id'> = {
            tontineId,
            type: type as VoteType,
            status: 'open',
            title: title.trim(),
            description: description?.trim() ?? null,
            eligibleVoters,
            candidates,
            votes: {},
            result: null,
            winner: null,
            requiredThreshold: THRESHOLDS[type as VoteType],
            meta: meta ?? null,
            turn: type === 'next_turn_selection' ? (tontine.currentTurn ?? 0) + 1 : null,
            createdBy: callerUid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt,
            closedAt: null,
            appliedAt: null,
        };

        await voteRef.set({ id: voteRef.id, ...voteData });

        // ── Notifier tous les membres éligibles ──────────────────────────────────
        const batch = db.batch();
        for (const uid of eligibleVoters) {
            if (uid === callerUid) continue;
            const notif = buildNotificationDoc(uid, {
                title: '🗳️ Nouveau vote',
                body: title.trim(),
                type: 'vote_open',
                tontineId,
                voteId: voteRef.id,
                voteType: type,
                senderUid: callerUid,
            });
            batch.set(notif.ref, notif.data);
            await sendNotificationToUser(uid, notif.data);
        }
        await batch.commit();

        return res.status(201).json({
            success: true,
            message: 'Vote créé avec succès',
            data: {
                voteId: voteRef.id,
                type,
                requiredThreshold: THRESHOLDS[type as VoteType],
                eligibleVotersCount: eligibleVoters.length,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/tontines/:id/votes
// Lister les votes (filtre par status optionnel)
// ─────────────────────────────────────────────────────────────────────────────
export const getVotes = async (
    req: Request<{ id: string }>,
    res: Response,
) => {
    const uid = (req as any).user.uid;
    const { id: tontineId } = req.params;
    const { status, type } = req.query;

    try {
        const member = await assertActiveMember(tontineId, uid);
        if (!member)
            return res.status(403).json({ success: false, error: 'Accès refusé' });

        let query: FirebaseFirestore.Query = db
            .collection('tontines').doc(tontineId)
            .collection('votes');

        if (status) query = query.where('status', '==', status);
        if (type) query = query.where('type', '==', type);

        const snap = await query.orderBy('createdAt', 'desc').get();
        const votes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        return res.json({ success: true, data: votes, count: votes.length });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/tontines/:id/votes/:voteId
// Détail d'un vote
// ─────────────────────────────────────────────────────────────────────────────
export const getVoteById = async (
    req: Request<{ id: string; voteId: string }>,
    res: Response,
) => {
    const uid = (req as any).user.uid;
    const { id: tontineId, voteId } = req.params;

    try {
        const member = await assertActiveMember(tontineId, uid);
        if (!member)
            return res.status(403).json({ success: false, error: 'Accès refusé' });

        const voteDoc = await db
            .collection('tontines').doc(tontineId)
            .collection('votes').doc(voteId)
            .get();

        if (!voteDoc.exists)
            return res.status(404).json({ success: false, error: 'Vote introuvable' });

        return res.json({ success: true, data: { id: voteDoc.id, ...voteDoc.data() } });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/tontines/:id/votes/:voteId/cast
// Voter
// ─────────────────────────────────────────────────────────────────────────────

export const castVote = async (
    req: Request<{ id: string; voteId: string }>,
    res: Response,
) => {
    const uid = (req as any).user.uid;
    const { id: tontineId, voteId } = req.params;
    const { choice } = req.body;

    if (!choice)
        return res.status(400).json({ success: false, error: 'choice requis' });

    try {
        // Vérification : membre actif (plus de eligibleVoters)
        const member = await assertActiveMember(tontineId, uid);
        if (!member)
            return res.status(403).json({ success: false, error: 'Accès refusé' });

        const voteRef = db.collection('tontines').doc(tontineId)
            .collection('votes').doc(voteId);
        const voteDoc = await voteRef.get();

        if (!voteDoc.exists)
            return res.status(404).json({ success: false, error: 'Vote introuvable' });

        const vote = { id: voteDoc.id, ...voteDoc.data() } as TontineVote;

        if (vote.status !== 'open')
            return res.status(400).json({ success: false, error: 'Ce vote est déjà clôturé' });

        if (vote.expiresAt && vote.expiresAt.toDate() < new Date()) {
            await voteRef.update({ status: 'closed', closedAt: admin.firestore.FieldValue.serverTimestamp() });
            return res.status(400).json({ success: false, error: 'Ce vote a expiré' });
        }

        if (!vote.candidates.includes(choice))
            return res.status(400).json({
                success: false,
                error: `Choix invalide, options : ${vote.candidates.join(', ')}`,
            });

        // Compter tous les membres actifs (pas eligibleVoters)
        const activeMembers = await getActiveMembers(tontineId);
        const totalActive = activeMembers.length;

        const updatedVotes = { ...vote.votes, [uid]: choice };

        const { voteCounts, winner, result, quorumReached } = computeResult(
            updatedVotes,
            vote.candidates,
            totalActive,           // utilise tous les membres actifs
            vote.requiredThreshold,
            vote.type,
        );

        const voteIsClosed = result !== null;

        await db.runTransaction(async (transaction) => {
            transaction.update(voteRef, {
                [`votes.${uid}`]: choice,
                ...(voteIsClosed ? {
                    status: 'closed',
                    result,
                    winner: winner ?? null,
                    closedAt: admin.firestore.FieldValue.serverTimestamp(),
                } : {}),
            });

            if (voteIsClosed && result === 'approved') {
                const fullVote: TontineVote = { ...vote, votes: updatedVotes, winner, result };

                if (vote.type === 'next_turn_selection' && winner) {
                    const tontineRef = db.collection('tontines').doc(tontineId);
                    const tontineDoc = await tontineRef.get();
                    const tontine = tontineDoc.data()!;
                    const nextTurn = (tontine.currentTurn ?? 0) + 1;

                    transaction.update(tontineRef, {
                        currentTurn: nextTurn,
                        currentBeneficiaryUid: winner,
                        completedTurns: admin.firestore.FieldValue.arrayUnion(winner),
                        lastTurnStartedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    const winnerRef = tontineRef.collection('members').doc(winner);
                    transaction.update(winnerRef, {
                        turnReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
                        'stats.totalReceived': admin.firestore.FieldValue.increment(tontine.potPerTurn),
                    });

                    const notif = buildNotificationDoc(winner, {
                        title: '🎉 Vous avez été désigné',
                        body: `Vous recevez ${tontine.potPerTurn} FCFA au tour ${nextTurn}`,
                        type: 'turn_received',
                        tontineId,
                        voteId,
                        amount: tontine.potPerTurn,
                        turn: nextTurn,
                    });
                    transaction.set(notif.ref, notif.data);
                } else {
                    // Application automatique de l'effet (exclusion, rôle, règle…)
                    await applyVoteEffect(fullVote, tontineId, transaction);
                }

                transaction.update(voteRef, {
                    appliedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
        });

        // Notifications si vote clôturé
        if (voteIsClosed) {
            const batch = db.batch();
            for (const m of activeMembers) {
                // Si exclusion approuvée : notifier la personne exclue aussi
                const isExcluded = vote.type === 'member_exclusion' && result === 'approved'
                    && (vote.meta as any)?.targetUid === m.uid;

                const notif = buildNotificationDoc(m.uid, {
                    title: isExcluded
                        ? 'Vous avez été exclu'
                        : result === 'approved' ? '✅ Vote approuvé' : '❌ Vote rejeté',
                    body: vote.title,
                    type: isExcluded ? 'member_excluded' : 'vote_closed',
                    tontineId,
                    voteId,
                    result,
                });
                batch.set(notif.ref, notif.data);
                await sendNotificationToUser(m.uid, notif.data);
            }
            await batch.commit();
        }

        return res.json({
            success: true,
            message: voteIsClosed
                ? result === 'approved'
                    ? 'Vote clôturé et approuvé, modifications appliquées automatiquement'
                    : 'Vote clôturé, proposition rejetée'
                : 'Vote enregistré',
            data: {
                voteCounts,
                totalVotes: Object.keys(updatedVotes).length,
                totalMembers: totalActive,
                quorumReached,
                winner: winner ?? null,
                result: result ?? null,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/tontines/:id/votes/:voteId/close
// Clôturer manuellement un vote (admin/créateur)
// ─────────────────────────────────────────────────────────────────────────────
export const closeVote = async (
    req: Request<{ id: string; voteId: string }>,
    res: Response,
) => {
    const uid = (req as any).user.uid;
    const { id: tontineId, voteId } = req.params;

    try {
        const member = await assertActiveMember(tontineId, uid);
        if (!member || !['creator', 'admin'].includes(member.role))
            return res.status(403).json({ success: false, error: 'Seul un admin peut clôturer un vote manuellement' });

        const voteRef = db.collection('tontines').doc(tontineId).collection('votes').doc(voteId);
        const voteDoc = await voteRef.get();

        if (!voteDoc.exists || voteDoc.data()?.status !== 'open')
            return res.status(404).json({ success: false, error: 'Vote ouvert introuvable' });

        const vote = { id: voteDoc.id, ...voteDoc.data() } as TontineVote;

        // Calculer le résultat final avec les votes actuels
        const { voteCounts, winner, result } = computeResult(
            vote.votes,
            vote.candidates,
            vote.eligibleVoters.length,
            vote.requiredThreshold,
            vote.type,
        );

        const finalResult: VoteResult = result ?? 'no_quorum';

        await db.runTransaction(async (transaction) => {
            transaction.update(voteRef, {
                status: 'closed',
                result: finalResult,
                winner: winner ?? null,
                closedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            if (finalResult === 'approved') {
                const fullVote: TontineVote = { ...vote, winner, result: finalResult };
                await applyVoteEffect(fullVote, tontineId, transaction);
                transaction.update(voteRef, {
                    appliedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
        });

        return res.json({
            success: true,
            message: `Vote clôturé, résultat : ${finalResult}`,
            data: { voteId, result: finalResult, winner: winner ?? null, voteCounts },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/tontines/:id/votes/:voteId
// Annuler un vote (créateur du vote uniquement, si aucun vote n'a encore été émis)
// ─────────────────────────────────────────────────────────────────────────────
export const cancelVote = async (
    req: Request<{ id: string; voteId: string }>,
    res: Response,
) => {
    const uid = (req as any).user.uid;
    const { id: tontineId, voteId } = req.params;

    try {
        const member = await assertActiveMember(tontineId, uid);
        if (!member)
            return res.status(403).json({ success: false, error: 'Accès refusé' });

        const voteRef = db.collection('tontines').doc(tontineId).collection('votes').doc(voteId);
        const voteDoc = await voteRef.get();

        if (!voteDoc.exists)
            return res.status(404).json({ success: false, error: 'Vote introuvable' });

        const vote = voteDoc.data()!;

        if (vote.status !== 'open')
            return res.status(400).json({ success: false, error: 'Seul un vote ouvert peut être annulé' });

        // Seul le créateur du vote ou un admin peut annuler
        const canCancel = vote.createdBy === uid || ['creator', 'admin'].includes(member.role);
        if (!canCancel)
            return res.status(403).json({ success: false, error: 'Vous n\'êtes pas autorisé à annuler ce vote' });

        if (Object.keys(vote.votes ?? {}).length > 0)
            return res.status(400).json({
                success: false,
                error: 'Impossible d\'annuler un vote qui a déjà reçu des voix',
            });

        await voteRef.update({
            status: 'cancelled',
            closedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({ success: true, message: 'Vote annulé' });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};