import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import {
    createTontine, getMyTontines, getTontineById,
    updateTontine, deleteTontine, getTontineInvite,
} from '../controllers/tontines.controller';

const router = Router();

/**
 * @swagger
 * /tontines:
 *   post:
 *     summary: Créer une nouvelle tontine (écran 7 — Récapitulatif)
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, name, amount, frequency, totalMembers, rotationMethod, securityModel]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [rotative, crescendo, epargne, solidarite]
 *                 example: rotative
 *               name:
 *                 type: string
 *                 example: "Tontine Famille Diop"
 *               description:
 *                 type: string
 *                 example: "Tontine mensuelle de la famille"
 *               emoji:
 *                 type: string
 *                 example: "👨‍👩‍👧‍👦"
 *               visibility:
 *                 type: string
 *                 enum: [private, semi_public]
 *                 example: private
 *               amount:
 *                 type: number
 *                 example: 15000
 *               frequency:
 *                 type: string
 *                 enum: [daily, weekly, biweekly, monthly]
 *                 example: monthly
 *               paymentDay:
 *                 type: number
 *                 example: 1
 *               totalMembers:
 *                 type: number
 *                 example: 10
 *               rotationMethod:
 *                 type: string
 *                 enum: [random, seniority, consensual, manual]
 *                 example: random
 *               gracePeriodDays:
 *                 type: number
 *                 example: 3
 *               penaltyType:
 *                 type: string
 *                 enum: [percentage, fixed]
 *                 example: percentage
 *               penaltyValue:
 *                 type: number
 *                 example: 5
 *               autoExclusionDays:
 *                 type: number
 *                 example: 14
 *               earlyExitAllowed:
 *                 type: string
 *                 enum: [with_penalty, majority_vote, never]
 *                 example: majority_vote
 *               modificationRule:
 *                 type: string
 *                 enum: [75_approval, immutable]
 *                 example: 75_approval
 *               securityModel:
 *                 type: string
 *                 enum: [escrow, direct, blocked, solidarity]
 *                 example: escrow
 *               guaranteeAmount:
 *                 type: number
 *                 example: 15000
 *     responses:
 *       201:
 *         description: Tontine créée — retourne tontineId + inviteCode
 *       400:
 *         description: Erreurs de validation
 *       500:
 *         description: Échec création (écran Erreur)
 */
router.post('/', verifyToken, createTontine);

/**
 * @swagger
 * /tontines:
 *   get:
 *     summary: Récupérer mes tontines
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, active, completed, dissolved]
 *         description: Filtrer par statut
 *     responses:
 *       200:
 *         description: Liste des tontines
 */
router.get('/', verifyToken, getMyTontines);

/**
 * @swagger
 * /tontines/{id}:
 *   get:
 *     summary: Détails d'une tontine (avec règles)
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Tontine + rules + rôle de l'utilisateur
 *       403:
 *         description: Non membre
 *       404:
 *         description: Introuvable
 */
router.get('/:id', verifyToken, getTontineById);

/**
 * @swagger
 * /tontines/{id}:
 *   patch:
 *     summary: Modifier une tontine (status pending uniquement)
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               amount: { type: number }
 *               totalMembers: { type: number }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: Tontine mise à jour
 *       400:
 *         description: Tontine déjà active
 *       403:
 *         description: Non créateur
 */
router.patch('/:id', verifyToken, updateTontine);

/**
 * @swagger
 * /tontines/{id}:
 *   delete:
 *     summary: Supprimer une tontine (status pending uniquement)
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Tontine supprimée
 *       400:
 *         description: Tontine active — dissolution requiert un vote
 *       403:
 *         description: Non créateur
 */
router.delete('/:id', verifyToken, deleteTontine);

/**
 * @swagger
 * /tontines/{id}/invite:
 *   get:
 *     summary: Récupérer le lien d'invitation et le QR Code
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: inviteCode + inviteLink + qrCodeUrl
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 inviteCode: { type: string, example: "ABC123" }
 *                 inviteLink: { type: string, example: "https://tontineplus.app/join/ABC123" }
 *                 qrCodeUrl: { type: string }
 */
router.get('/:id/invite', verifyToken, getTontineInvite);

export default router;