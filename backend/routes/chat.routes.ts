import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import {
    sendMessage,
    getMessages,
    deleteMessage,
    reactToMessage,
    createVote,
    castChatVote,
    closeVote,
    markAsRead,
    getMyConversations,
} from '../controllers/chat.controller';

const router = Router({ mergeParams: true }); // mergeParams pour accéder à :id de la tontine parente

/**
 * @swagger
 * /chat/conversations:
 *   get:
 *     summary: Liste de toutes mes conversations (une par tontine)
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Liste avec preview du dernier message et nombre de non-lus
 */
router.get('/conversations', verifyToken, getMyConversations);

/**
 * @swagger
 * /tontines/{id}/chat:
 *   get:
 *     summary: Charger les messages d'une tontine (pagination par curseur)
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: number, default: 30 }
 *       - in: query
 *         name: before
 *         schema: { type: string }
 *         description: ID du message curseur (pour charger les messages plus anciens)
 *     responses:
 *       200:
 *         description: Liste de messages dans l'ordre chronologique
 */
router.get('/', verifyToken, getMessages);

/**
 * @swagger
 * /tontines/{id}/chat:
 *   post:
 *     summary: Envoyer un message texte
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *                 example: "Bonjour tout le monde !"
 *     responses:
 *       201:
 *         description: Message envoyé — retourne le messageId
 */
router.post('/', verifyToken, sendMessage);

/**
 * @swagger
 * /tontines/{id}/chat/vote:
 *   post:
 *     summary: Créer un vote dans le chat (admin/créateur uniquement)
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question, options]
 *             properties:
 *               question:
 *                 type: string
 *                 example: "Quel jour pour la réunion ?"
 *               options:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["Samedi matin", "Dimanche soir"]
 *               expiresInHours:
 *                 type: number
 *                 example: 48
 *     responses:
 *       201:
 *         description: Vote créé — carte vote affichée dans le chat
 */
router.post('/vote', verifyToken, createVote);

/**
 * @swagger
 * /tontines/{id}/chat/{messageId}/vote/cast:
 *   post:
 *     summary: Voter sur une proposition dans le chat
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [optionId]
 *             properties:
 *               optionId:
 *                 type: string
 *                 example: "opt_0"
 *     responses:
 *       200:
 *         description: Vote enregistré avec résultats actuels
 */
router.post('/:messageId/vote/cast', verifyToken, castChatVote);

/**
 * @swagger
 * /tontines/{id}/chat/{messageId}/vote/close:
 *   patch:
 *     summary: Clôturer un vote (admin/créateur)
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.patch('/:messageId/vote/close', verifyToken, closeVote);

/**
 * @swagger
 * /tontines/{id}/chat/{messageId}/react:
 *   post:
 *     summary: Ajouter / retirer une réaction emoji sur un message
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [emoji]
 *             properties:
 *               emoji:
 *                 type: string
 *                 example: "👍"
 *                 enum: ["👍", "❤️", "😂", "😮", "🙏", "🔥"]
 *     responses:
 *       200:
 *         description: Réaction ajoutée ou retirée (toggle)
 */
router.post('/:messageId/react', verifyToken, reactToMessage);

/**
 * @swagger
 * /tontines/{id}/chat/{messageId}/read:
 *   patch:
 *     summary: Marquer un message comme lu
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.patch('/:messageId/read', verifyToken, markAsRead);

/**
 * @swagger
 * /tontines/{id}/chat/{messageId}:
 *   delete:
 *     summary: Supprimer un message (auteur ou admin)
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.delete('/:messageId', verifyToken, deleteMessage);

export default router;
