import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    registerFcmToken,
    removeFcmToken,
    sendManualNotification,
} from '../controllers/notification.controller';

const router = Router();

// ─────────────────────────────────────────────────────────────
// TOKENS FCM
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /notifications/token:
 *   post:
 *     summary: Enregistrer un token FCM (push notifications)
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token FCM fourni par Firebase Messaging côté app
 *     responses:
 *       200:
 *         description: Token enregistré
 */
router.post('/token', verifyToken, registerFcmToken);

/**
 * @swagger
 * /notifications/token:
 *   delete:
 *     summary: Retirer un token FCM (déconnexion / désactivation)
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token retiré
 */
router.delete('/token', verifyToken, removeFcmToken);

// ─────────────────────────────────────────────────────────────
// LECTURE
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Récupérer mes notifications (paginées)
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean, default: false }
 *         description: Filtrer uniquement les notifications non lues
 *     responses:
 *       200:
 *         description: Liste des notifications + meta (total, unreadCount, pagination)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       title: { type: string }
 *                       body: { type: string }
 *                       type: { type: string }
 *                       isRead: { type: boolean }
 *                       createdAt: { type: string }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     unreadCount: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     totalPages: { type: integer }
 */
router.get('/', verifyToken, getNotifications);

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Nombre de notifications non lues (badge)
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Compteur pour le badge de l'icône
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     unreadCount: { type: integer }
 */
router.get('/unread-count', verifyToken, getUnreadCount);

// ─────────────────────────────────────────────────────────────
// MARQUER COMME LU
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     summary: Marquer toutes les notifications comme lues
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Nombre de notifications mises à jour
 */
router.patch('/read-all', verifyToken, markAllAsRead);

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     summary: Marquer une notification comme lue
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification marquée comme lue
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Notification introuvable
 */
router.patch('/:id/read', verifyToken, markAsRead);

// ─────────────────────────────────────────────────────────────
// SUPPRESSION
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /notifications:
 *   delete:
 *     summary: Supprimer toutes mes notifications (soft delete)
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Nombre de notifications supprimées
 */
router.delete('/', verifyToken, deleteAllNotifications);

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     summary: Supprimer une notification (soft delete)
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification supprimée
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Notification introuvable
 */
router.delete('/:id', verifyToken, deleteNotification);

// ─────────────────────────────────────────────────────────────
// ENVOI MANUEL (admin / tests)
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /notifications/send:
 *   post:
 *     summary: Envoyer une notification manuelle (usage interne/admin)
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, title, body, type]
 *             properties:
 *               userId: { type: string }
 *               title: { type: string, example: "Rappel de cotisation" }
 *               body: { type: string, example: "Votre cotisation est due dans 48h" }
 *               type:
 *                 type: string
 *                 enum:
 *                   - cotisation_reminder
 *                   - cotisation_paid
 *                   - cotisation_late
 *                   - turn_received
 *                   - member_to_validate
 *                   - member_joined
 *                   - member_excluded
 *                   - tontine_started
 *                   - tontine_ended
 *                   - payout_sent
 *                   - vote_opened
 *                   - vote_closed
 *                   - system
 *               tontineId: { type: string }
 *               amount: { type: number }
 *     responses:
 *       201:
 *         description: Notification envoyée et persistée
 */
router.post('/send', verifyToken, sendManualNotification);

export default router;