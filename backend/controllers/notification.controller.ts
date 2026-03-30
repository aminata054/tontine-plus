import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { sendNotificationToUser } from '../services/notification.service';
import { NotificationType } from '../types/notification.type';

// ─────────────────────────────────────────────────────────────
// GET /api/v1/notifications — MES NOTIFICATIONS
//
// Query params :
//   page       (défaut 1)
//   limit      (défaut 20, max 50)
//   unreadOnly (boolean — défaut false)
// ─────────────────────────────────────────────────────────────
export const getNotifications = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    const limit = Math.min(Number(req.query.limit ?? 20), 50);
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const unreadOnly = req.query.unreadOnly === 'true';

    try {
        let query = db
            .collection('notifications')
            .where('userId', '==', uid)
            .where('deletedAt', '==', null)      // exclure les soft-deleted
            .orderBy('createdAt', 'desc');

        if (unreadOnly) {
            query = query.where('isRead', '==', false) as any;
        }

        // Pagination manuelle (offset Firestore via startAfter)
        const countSnap = await query.count().get();
        const total = countSnap.data().count;

        // Pour la page > 1, on saute les docs précédents
        let paginatedQuery = query.limit(limit);
        if (page > 1) {
            const skipSnap = await query.limit((page - 1) * limit).get();
            const lastDoc = skipSnap.docs[skipSnap.docs.length - 1];
            if (lastDoc) paginatedQuery = query.startAfter(lastDoc).limit(limit);
        }

        const snap = await paginatedQuery.get();
        const notifications = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Compter les non lus séparément (badge)
        const unreadCountSnap = await db
            .collection('notifications')
            .where('userId', '==', uid)
            .where('isRead', '==', false)
            .where('deletedAt', '==', null)
            .count()
            .get();

        return res.json({
            success: true,
            data: notifications,
            meta: {
                total,
                unreadCount: unreadCountSnap.data().count,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/notifications/unread-count — BADGE
// ─────────────────────────────────────────────────────────────
export const getUnreadCount = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    try {
        const snap = await db
            .collection('notifications')
            .where('userId', '==', uid)
            .where('isRead', '==', false)
            .where('deletedAt', '==', null)
            .count()
            .get();

        return res.json({ success: true, data: { unreadCount: snap.data().count } });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/notifications/:id/read — MARQUER LUE
// ─────────────────────────────────────────────────────────────
export const markAsRead = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    try {
        const notifDoc = await db.collection('notifications').doc(id).get();

        if (!notifDoc.exists) {
            return res.status(404).json({ success: false, error: 'Notification introuvable' });
        }

        if (notifDoc.data()?.userId !== uid) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        if (notifDoc.data()?.isRead) {
            return res.json({ success: true, message: 'Déjà marquée comme lue' });
        }

        await db.collection('notifications').doc(id).update({
            isRead: true,
            readAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({ success: true, message: 'Notification marquée comme lue' });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/notifications/read-all — TOUT MARQUER LU
// ─────────────────────────────────────────────────────────────
export const markAllAsRead = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    try {
        const snap = await db
            .collection('notifications')
            .where('userId', '==', uid)
            .where('isRead', '==', false)
            .where('deletedAt', '==', null)
            .get();

        if (snap.empty) {
            return res.json({ success: true, message: 'Aucune notification non lue', updated: 0 });
        }

        // Batch Firestore (max 500 ops par batch)
        const batches: FirebaseFirestore.WriteBatch[] = [];
        let batch = db.batch();
        let count = 0;

        snap.docs.forEach((doc) => {
            batch.update(doc.ref, {
                isRead: true,
                readAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            count++;
            if (count % 499 === 0) {
                batches.push(batch);
                batch = db.batch();
            }
        });
        batches.push(batch);

        await Promise.all(batches.map((b) => b.commit()));

        return res.json({
            success: true,
            message: `${snap.size} notification(s) marquée(s) comme lues`,
            updated: snap.size,
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/v1/notifications/:id — SUPPRIMER (soft delete)
// ─────────────────────────────────────────────────────────────
export const deleteNotification = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    const uid = (req as any).user.uid;
    const { id } = req.params;

    try {
        const notifDoc = await db.collection('notifications').doc(id).get();

        if (!notifDoc.exists) {
            return res.status(404).json({ success: false, error: 'Notification introuvable' });
        }

        if (notifDoc.data()?.userId !== uid) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        await db.collection('notifications').doc(id).update({
            deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({ success: true, message: 'Notification supprimée' });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/v1/notifications — SUPPRIMER TOUTES (soft)
// ─────────────────────────────────────────────────────────────
export const deleteAllNotifications = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    try {
        const snap = await db
            .collection('notifications')
            .where('userId', '==', uid)
            .where('deletedAt', '==', null)
            .get();

        if (snap.empty) {
            return res.json({ success: true, message: 'Aucune notification à supprimer', deleted: 0 });
        }

        const batches: FirebaseFirestore.WriteBatch[] = [];
        let batch = db.batch();
        let count = 0;

        snap.docs.forEach((doc) => {
            batch.update(doc.ref, {
                deletedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            count++;
            if (count % 499 === 0) {
                batches.push(batch);
                batch = db.batch();
            }
        });
        batches.push(batch);

        await Promise.all(batches.map((b) => b.commit()));

        return res.json({
            success: true,
            message: `${snap.size} notification(s) supprimée(s)`,
            deleted: snap.size,
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/notifications/token — ENREGISTRER UN TOKEN FCM
//
// À appeler depuis l'app mobile dès qu'un token FCM est disponible
// (ou refresh du token).
// ─────────────────────────────────────────────────────────────
export const registerFcmToken = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
        return res.status(400).json({ success: false, error: 'token FCM requis' });
    }

    try {
        // arrayUnion évite les doublons nativement
        await db.collection('users').doc(uid).update({
            fcmTokens: admin.firestore.FieldValue.arrayUnion(token),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({ success: true, message: 'Token FCM enregistré' });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/v1/notifications/token — RETIRER UN TOKEN FCM
//
// À appeler lors de la déconnexion ou désactivation des notifs.
// ─────────────────────────────────────────────────────────────
export const removeFcmToken = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
        return res.status(400).json({ success: false, error: 'token FCM requis' });
    }

    try {
        await db.collection('users').doc(uid).update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({ success: true, message: 'Token FCM retiré' });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/notifications/send — ENVOYER (admin / tests)
//
// Réservé à un admin ou usage interne.
// Body: { userId, title, body, type, ...data }
// ─────────────────────────────────────────────────────────────
export const sendManualNotification = async (req: Request, res: Response) => {
    const { userId, title, body, type, ...data } = req.body;

    if (!userId || !title || !body || !type) {
        return res.status(400).json({
            success: false,
            error: 'userId, title, body et type sont requis',
        });
    }

    const validTypes: NotificationType[] = [
        'cotisation_reminder', 'cotisation_paid', 'cotisation_late',
        'turn_received', 'member_to_validate', 'member_joined',
        'member_excluded', 'tontine_started', 'tontine_ended',
        'payout_sent', 'vote_opened', 'vote_closed', 'system',
    ];

    if (!validTypes.includes(type)) {
        return res.status(400).json({ success: false, error: 'type de notification invalide' });
    }

    try {
        const notificationId = await sendNotificationToUser(userId, {
            title,
            body,
            type,
            ...data,
        });

        return res.status(201).json({
            success: true,
            message: 'Notification envoyée',
            data: { notificationId },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};