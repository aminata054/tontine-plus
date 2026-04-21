import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { buildNotificationDoc, sendNotificationToUser } from '../services/notification.service';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type MessageType = 'text' | 'vote' | 'system';
type VoteStatus = 'open' | 'closed';

interface VoteOption {
    id: string;
    label: string;
}

interface VoteData {
    question: string;
    options: VoteOption[];
    votes: Record<string, string>; // { uid: optionId }
    status: VoteStatus;
    expiresAt: admin.firestore.Timestamp | null;
    createdBy: string;
}

// ─────────────────────────────────────────────────────────────
// UTILITAIRE — vérifier qu'un uid est membre actif
// ─────────────────────────────────────────────────────────────
const assertActiveMember = async (
    tontineId: string,
    uid: string
): Promise<{ role: string } | null> => {
    const memberDoc = await db
        .collection('tontines').doc(tontineId)
        .collection('members').doc(uid)
        .get();

    if (!memberDoc.exists) return null;
    const data = memberDoc.data()!;
    if (data.status !== 'active') return null;
    return { role: data.role };
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/tontines/:id/chat
// Envoyer un message texte
// ─────────────────────────────────────────────────────────────
export const sendMessage = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    const senderUid = (req as any).user.uid;
    const { id: tontineId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
        return res.status(400).json({ success: false, error: 'Le message ne peut pas être vide' });
    }

    if (text.trim().length > 1000) {
        return res.status(400).json({ success: false, error: 'Message trop long (max 1000 caractères)' });
    }

    try {
        const member = await assertActiveMember(tontineId, senderUid);
        if (!member) {
            return res.status(403).json({ success: false, error: 'Accès refusé — vous n\'êtes pas membre actif de cette tontine' });
        }

        const senderDoc = await db.collection('users').doc(senderUid).get();
        const senderData = senderDoc.data() ?? {};

        const msgRef = db.collection('tontines').doc(tontineId).collection('chat').doc();

        await msgRef.set({
            id: msgRef.id,
            tontineId,
            type: 'text' as MessageType,
            senderId: senderUid,
            senderName: senderData.fullName ?? null,
            senderPhotoUrl: senderData.photoUrl ?? null,
            senderRole: member.role,
            text: text.trim(),
            readBy: [senderUid],
            reactions: {},      // { emoji: uid[] }
            replyTo: null,      // { messageId, senderName, preview }
            editedAt: null,
            deletedAt: null,
            vote: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Mettre à jour le champ lastMessage sur la tontine (pour la preview)
        await db.collection('tontines').doc(tontineId).update({
            'chat.lastMessage': text.trim().substring(0, 80),
            'chat.lastMessageAt': admin.firestore.FieldValue.serverTimestamp(),
            'chat.lastMessageSender': senderData.fullName ?? senderUid,
        });

        return res.status(201).json({
            success: true,
            data: { messageId: msgRef.id },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/tontines/:id/chat
// Charger les messages (pagination par curseur)
// ─────────────────────────────────────────────────────────────
export const getMessages = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id: tontineId } = req.params;
    const { limit = '30', before } = req.query;

    try {
        const member = await assertActiveMember(tontineId, uid);
        if (!member) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        let query = db
            .collection('tontines').doc(tontineId)
            .collection('chat')
            .where('deletedAt', '==', null)
            .orderBy('createdAt', 'desc')
            .limit(Math.min(Number(limit), 50));

        // Pagination par curseur (charger les messages plus anciens)
        if (before) {
            const cursorDoc = await db
                .collection('tontines').doc(tontineId)
                .collection('chat').doc(before as string)
                .get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snap = await query.get();
        if (!snap) {
            return res.json({
                success: true,
            });
        }

        const snapDoc = snap.docs[0];

        if (!snapDoc) {
            return res.json({
                success: true,
                data: [],
                count: 0,
                hasMore: false,
                nextCursor: null,
            });
        }

        const messages = snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .reverse(); // remettre dans l'ordre chronologique

        return res.json({
            success: true,
            data: messages,
            count: messages.length,
            hasMore: snap.docs.length === Number(limit),
            nextCursor: snap.docs.length > 0 ? snapDoc.id : null,
        });


    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/v1/tontines/:id/chat/:messageId
// Supprimer son propre message (soft delete)
// ─────────────────────────────────────────────────────────────
export const deleteMessage = async (
    req: Request<{ id: string; messageId: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id: tontineId, messageId } = req.params;

    try {
        const member = await assertActiveMember(tontineId, uid);
        if (!member) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        const msgRef = db
            .collection('tontines').doc(tontineId)
            .collection('chat').doc(messageId);

        const msgDoc = await msgRef.get();
        if (!msgDoc.exists) {
            return res.status(404).json({ success: false, error: 'Message introuvable' });
        }

        const msg = msgDoc.data()!;

        // Seul l'auteur ou un admin/créateur peut supprimer
        const canDelete = msg.senderId === uid || ['creator', 'admin'].includes(member.role);
        if (!canDelete) {
            return res.status(403).json({ success: false, error: 'Vous ne pouvez pas supprimer ce message' });
        }

        await msgRef.update({
            deletedAt: admin.firestore.FieldValue.serverTimestamp(),
            text: null,
        });

        return res.json({ success: true, message: 'Message supprimé' });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/tontines/:id/chat/:messageId/react
// Ajouter / retirer une réaction emoji
// ─────────────────────────────────────────────────────────────
export const reactToMessage = async (
    req: Request<{ id: string; messageId: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id: tontineId, messageId } = req.params;
    const { emoji } = req.body;

    const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '🔥'];
    if (!emoji || !ALLOWED_EMOJIS.includes(emoji)) {
        return res.status(400).json({
            success: false,
            error: `Emoji non autorisé — valeurs acceptées : ${ALLOWED_EMOJIS.join(' ')}`,
        });
    }

    try {
        const member = await assertActiveMember(tontineId, uid);
        if (!member) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        const msgRef = db
            .collection('tontines').doc(tontineId)
            .collection('chat').doc(messageId);

        const msgDoc = await msgRef.get();
        if (!msgDoc.exists) {
            return res.status(404).json({ success: false, error: 'Message introuvable' });
        }

        const reactions = msgDoc.data()?.reactions ?? {};
        const currentList: string[] = reactions[emoji] ?? [];
        const alreadyReacted = currentList.includes(uid);

        // Toggle : si déjà réagi → retirer, sinon → ajouter
        if (alreadyReacted) {
            await msgRef.update({
                [`reactions.${emoji}`]: admin.firestore.FieldValue.arrayRemove(uid),
            });
        } else {
            await msgRef.update({
                [`reactions.${emoji}`]: admin.firestore.FieldValue.arrayUnion(uid),
            });
        }

        return res.json({
            success: true,
            data: { toggled: alreadyReacted ? 'removed' : 'added', emoji },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/tontines/:id/chat/vote
// Créer un vote (admin/créateur uniquement)
// ─────────────────────────────────────────────────────────────
export const createVote = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    const senderUid = (req as any).user.uid;
    const { id: tontineId } = req.params;
    const { question, options, expiresInHours } = req.body;

    // Validation
    const errors: string[] = [];
    if (!question || question.trim().length < 5)
        errors.push('question requise (minimum 5 caractères)');

    if (!Array.isArray(options) || options.length < 2 || options.length > 6)
        errors.push('options : entre 2 et 6 choix');

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    try {
        const member = await assertActiveMember(tontineId, senderUid);
        if (!member) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        // Seuls admin et créateur peuvent lancer un vote
        if (!['creator', 'admin'].includes(member.role)) {
            return res.status(403).json({
                success: false,
                error: 'Seul l\'administrateur peut lancer un vote dans le chat',
            });
        }

        const senderDoc = await db.collection('users').doc(senderUid).get();
        const senderData = senderDoc.data() ?? {};

        // Expiration optionnelle
        let expiresAt: admin.firestore.Timestamp | null = null;
        if (expiresInHours && Number(expiresInHours) > 0) {
            const expDate = new Date();
            expDate.setHours(expDate.getHours() + Number(expiresInHours));
            expiresAt = admin.firestore.Timestamp.fromDate(expDate);
        }

        const voteOptions: VoteOption[] = (options as string[]).map((label, i) => ({
            id: `opt_${i}`,
            label: label.trim(),
        }));

        const voteData: VoteData = {
            question: question.trim(),
            options: voteOptions,
            votes: {},
            status: 'open',
            expiresAt,
            createdBy: senderUid,
        };

        const msgRef = db
            .collection('tontines').doc(tontineId)
            .collection('chat').doc();

        await msgRef.set({
            id: msgRef.id,
            tontineId,
            type: 'vote' as MessageType,
            senderId: senderUid,
            senderName: senderData.fullName ?? null,
            senderPhotoUrl: senderData.photoUrl ?? null,
            senderRole: member.role,
            text: `📊 Vote : ${question.trim()}`,
            readBy: [senderUid],
            reactions: {},
            replyTo: null,
            editedAt: null,
            deletedAt: null,
            vote: voteData,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Mise à jour preview tontine
        await db.collection('tontines').doc(tontineId).update({
            'chat.lastMessage': `📊 Vote : ${question.trim().substring(0, 60)}`,
            'chat.lastMessageAt': admin.firestore.FieldValue.serverTimestamp(),
            'chat.lastMessageSender': senderData.fullName ?? senderUid,
        });

        // Notifier tous les membres actifs
        const membersSnap = await db
            .collection('tontines').doc(tontineId)
            .collection('members')
            .where('status', '==', 'active')
            .get();

        const batch = db.batch();
        for (const m of membersSnap.docs) {
            if (m.id === senderUid) continue;
            const notif = buildNotificationDoc(m.id, {
                title: '📊 Nouveau vote',
                body: question.trim(),
                type: 'vote_opened',
                tontineId,
                messageId: msgRef.id,
                senderUid,
            });
            batch.set(notif.ref, notif.data);
            await sendNotificationToUser(m.id, notif.data);
        }
        await batch.commit();

        return res.status(201).json({
            success: true,
            message: 'Vote créé avec succès',
            data: { messageId: msgRef.id, vote: voteData },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/tontines/:id/chat/:messageId/vote/cast
// Voter sur un message de type "vote"
// ─────────────────────────────────────────────────────────────
export const castChatVote = async (
    req: Request<{ id: string; messageId: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id: tontineId, messageId } = req.params;
    const { optionId } = req.body;

    if (!optionId) {
        return res.status(400).json({ success: false, error: 'optionId requis' });
    }

    try {
        const member = await assertActiveMember(tontineId, uid);
        if (!member) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        const msgRef = db
            .collection('tontines').doc(tontineId)
            .collection('chat').doc(messageId);

        const msgDoc = await msgRef.get();
        if (!msgDoc.exists) {
            return res.status(404).json({ success: false, error: 'Message introuvable' });
        }

        const msg = msgDoc.data()!;

        if (msg.type !== 'vote') {
            return res.status(400).json({ success: false, error: 'Ce message n\'est pas un vote' });
        }

        const vote: VoteData = msg.vote;

        if (vote.status === 'closed') {
            return res.status(400).json({ success: false, error: 'Ce vote est déjà clôturé' });
        }

        // Vérifier expiration
        if (vote.expiresAt && vote.expiresAt.toDate() < new Date()) {
            await msgRef.update({ 'vote.status': 'closed' });
            return res.status(400).json({ success: false, error: 'Ce vote a expiré' });
        }

        // Vérifier que optionId est valide
        const validOption = vote.options.find((o: VoteOption) => o.id === optionId);
        if (!validOption) {
            return res.status(400).json({ success: false, error: 'Option invalide' });
        }

        // Enregistrer le vote (écrase le vote précédent si l'utilisateur revoote)
        await msgRef.update({
            [`vote.votes.${uid}`]: optionId,
        });

        // Calculer les résultats actuels
        const updatedVotes = { ...vote.votes, [uid]: optionId };
        const results: Record<string, number> = {};
        for (const opt of vote.options) {
            results[opt.id] = Object.values(updatedVotes).filter(v => v === opt.id).length;
        }

        return res.json({
            success: true,
            message: 'Vote enregistré',
            data: {
                results,
                totalVotes: Object.keys(updatedVotes).length,
                yourVote: optionId,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/tontines/:id/chat/:messageId/vote/close
// Clôturer un vote (admin/créateur)
// ─────────────────────────────────────────────────────────────
export const closeVote = async (
    req: Request<{ id: string; messageId: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id: tontineId, messageId } = req.params;

    try {
        const member = await assertActiveMember(tontineId, uid);
        if (!member || !['creator', 'admin'].includes(member.role)) {
            return res.status(403).json({ success: false, error: 'Seul l\'admin peut clôturer un vote' });
        }

        const msgRef = db
            .collection('tontines').doc(tontineId)
            .collection('chat').doc(messageId);

        const msgDoc = await msgRef.get();
        if (!msgDoc.exists || msgDoc.data()?.type !== 'vote') {
            return res.status(404).json({ success: false, error: 'Vote introuvable' });
        }

        await msgRef.update({ 'vote.status': 'closed' });

        return res.json({ success: true, message: 'Vote clôturé' });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/tontines/:id/chat/:messageId/read
// Marquer des messages comme lus
// ─────────────────────────────────────────────────────────────
export const markAsRead = async (
    req: Request<{ id: string; messageId: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id: tontineId, messageId } = req.params;

    try {
        const member = await assertActiveMember(tontineId, uid);
        if (!member) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        await db
            .collection('tontines').doc(tontineId)
            .collection('chat').doc(messageId)
            .update({
                readBy: admin.firestore.FieldValue.arrayUnion(uid),
            });

        return res.json({ success: true });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/tontines/chat/conversations
// Liste de toutes mes conversations (une par tontine)
// avec preview du dernier message et nb non lus
// ─────────────────────────────────────────────────────────────
export const getMyConversations = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    try {
        const userDoc = await db.collection('users').doc(uid).get();
        const tontineIds: string[] = userDoc.data()?.tontineIds ?? [];

        if (tontineIds.length === 0) {
            return res.json({ success: true, data: [], count: 0 });
        }

        const conversations: any[] = [];

        // Chunks de 30 (limite Firestore)
        const chunks: string[][] = [];
        for (let i = 0; i < tontineIds.length; i += 30) {
            chunks.push(tontineIds.slice(i, i + 30));
        }

        for (const chunk of chunks) {
            const snap = await db
                .collection('tontines')
                .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                .get();

            for (const doc of snap.docs) {
                const t = doc.data();

                // Compter les messages non lus pour cet utilisateur
                const unreadSnap = await db
                    .collection('tontines').doc(doc.id)
                    .collection('chat')
                    .where('deletedAt', '==', null)
                    .where('readBy', 'not-in', [[uid]])  // approximation
                    .limit(99)
                    .get()
                    .catch(() => ({ size: 0 }));

                conversations.push({
                    tontineId: doc.id,
                    tontineName: t.name,
                    tontineIcon: t.iconUrl ?? null,
                    tontineStatus: t.status,
                    membersCount: t.currentMembers,
                    lastMessage: t.chat?.lastMessage ?? null,
                    lastMessageAt: t.chat?.lastMessageAt ?? null,
                    lastMessageSender: t.chat?.lastMessageSender ?? null,
                    unreadCount: (unreadSnap as any).size ?? 0,
                });
            }
        }

        // Trier par dernière activité
        conversations.sort((a, b) => {
            const dateA = a.lastMessageAt?.toMillis?.() ?? 0;
            const dateB = b.lastMessageAt?.toMillis?.() ?? 0;
            return dateB - dateA;
        });

        return res.json({
            success: true,
            data: conversations,
            count: conversations.length,
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};