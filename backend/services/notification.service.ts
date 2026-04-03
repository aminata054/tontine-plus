import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { NotificationPayload, NotificationType } from '../types/notification.type';

// ─────────────────────────────────────────────────────────────
// SERVICE — Firebase Cloud Messaging + persistance Firestore
// ─────────────────────────────────────────────────────────────

/**
 * Envoie une notification FCM à un utilisateur ET la persiste en Firestore.
 *
 * @param userId   - UID Firebase de l'utilisateur cible
 * @param payload  - Contenu de la notification
 * @returns        - ID du document Firestore créé
 */
export const sendNotificationToUser = async (
    userId: string,
    payload: NotificationPayload
): Promise<string> => {
    // 1. Persister en Firestore (toujours, même si pas de token FCM)
    const notifRef = db.collection('notifications').doc();

    const { title, body, type, ...rest } = payload;

    await notifRef.set({
        id: notifRef.id,
        userId,
        title,
        body,
        type,
        isRead: false,
        data: rest,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        readAt: null,
        deletedAt: null,
    });

    // 2. Récupérer le(s) token(s) FCM de l'utilisateur
    const userDoc = await db.collection('users').doc(userId).get();
    const fcmTokens: string[] = userDoc.data()?.fcmTokens ?? [];

    if (fcmTokens.length === 0) {
        return notifRef.id; // pas de token → on a quand même persisté
    }

    // 3. Envoyer via FCM (multicast si plusieurs appareils)
    const message: admin.messaging.MulticastMessage = {
        tokens: fcmTokens,
        notification: { title, body },
        data: {
            notificationId: notifRef.id,
            type,
            ...Object.fromEntries(
                Object.entries(rest).map(([k, v]) => [k, String(v ?? '')])
            ),
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'tontine_notifications',
                sound: 'default',
            },
        },
        apns: {
            payload: {
                aps: { sound: 'default', badge: 1 },
            },
        },
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);

        // Nettoyer les tokens invalides
        const invalidTokens: string[] = [];
        response.responses.forEach((r, idx) => {
            if (!r.success) {
                const code = r.error?.code;
                if (
                    code === 'messaging/invalid-registration-token' ||
                    code === 'messaging/registration-token-not-registered'
                ) {
                    const token = fcmTokens[idx];
                    if (token) {
                        invalidTokens.push(token);
                    }
                }
            }
        });

        if (invalidTokens.length > 0) {
            await db.collection('users').doc(userId).update({
                fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
            });
        }
    } catch (_) {
        // FCM failure ne doit pas bloquer — la notif est déjà en Firestore
    }

    return notifRef.id;
};

/**
 * Envoie une notification à plusieurs utilisateurs en parallèle.
 */
export const sendNotificationToMany = async (
    userIds: string[],
    payload: NotificationPayload
): Promise<void> => {
    await Promise.allSettled(
        userIds.map((uid) => sendNotificationToUser(uid, payload))
    );
};

// ─────────────────────────────────────────────────────────────
// HELPERS MÉTIER — Notifications prêtes à l'emploi
// ─────────────────────────────────────────────────────────────

export const notifyTontineMembers = async (
    tontineId: string,
    payload: NotificationPayload
): Promise<void> => {
    const membersSnap = await db
        .collection('tontines')
        .doc(tontineId)
        .collection('members')
        .where('status', '==', 'active')
        .get();

    const uids = membersSnap.docs.map((d) => d.id);
    await sendNotificationToMany(uids, payload);
};

/** Rappel de cotisation J-2 */
export const notifyCotisationReminder = (
    userId: string,
    tontineName: string,
    amount: number,
    dueDate: string
) =>
    sendNotificationToUser(userId, {
        title: `Cotisation ${tontineName} dans 48h`,
        body: `Montant : ${amount.toLocaleString('fr-FR')} FCFA`,
        type: 'cotisation_reminder',
        tontineName,
        amount,
        currency: 'XOF',
        date: dueDate,
    });

/** Confirmation de paiement */
export const notifyCotisationPaid = (
    userId: string,
    tontineName: string,
    amount: number
) =>
    sendNotificationToUser(userId, {
        title: 'Cotisation payée avec succès',
        body: `Tontine : ${tontineName} | ${amount.toLocaleString('fr-FR')} FCFA`,
        type: 'cotisation_paid',
        tontineName,
        amount,
        currency: 'XOF',
    });

/** Cotisation en retard */
export const notifyCotisationLate = (
    userId: string,
    tontineName: string,
    amount: number
) =>
    sendNotificationToUser(userId, {
        title: `Cotisation en retard - ${tontineName}`,
        body: `Tontine : ${tontineName} | ${amount.toLocaleString('fr-FR')} FCFA`,
        type: 'cotisation_late',
        tontineName,
        amount,
        currency: 'XOF',
    });

/** C'est votre tour */
export const notifyTurnReceived = (
    userId: string,
    tontineName: string,
    amount: number,
    payoutDate: string
) =>
    sendNotificationToUser(userId, {
        title: "C'est votre tour ce mois-ci !",
        body: `Vous recevrez ${amount.toLocaleString('fr-FR')} FCFA le ${payoutDate}`,
        type: 'turn_received',
        tontineName,
        amount,
        currency: 'XOF',
        date: payoutDate,
    });

/** Nouveau membre à valider */
export const notifyMemberToValidate = (
    adminUserId: string,
    tontineName: string,
    memberName: string,
    tontineId: string
) =>
    sendNotificationToUser(adminUserId, {
        title: 'Nouveau membre à valider',
        body: `${memberName} souhaite rejoindre ${tontineName}`,
        type: 'member_to_validate',
        tontineName,
        tontineId,
        memberName,
    });

export const buildNotificationDoc = (
    userId: string,
    payload: NotificationPayload
) => {
    const notifRef = db.collection('notifications').doc();

    const { title, body, type, ...rest } = payload;

    return {
        ref: notifRef,
        data: {
            id: notifRef.id,
            userId,
            title,
            body,
            type,
            isRead: false,
            data: rest,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            readAt: null,
            deletedAt: null,
        }
    };
};