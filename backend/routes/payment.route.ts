import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import {
    initiatePayment,
    verifyPayment,
    getPaymentReceipt,
    getMyPayments,
    manualVerifyPayment,
} from '../controllers/payment.controller';

const router = Router();

/**
 * @swagger
 * /payments/initiate:
 *   post:
 *     summary: Initier un paiement de cotisation dans une tontine
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tontineId, paymentMethod, paymentMethodNumber]
 *             properties:
 *               tontineId:
 *                 type: string
 *                 example: "abc123"
 *               paymentMethod:
 *                 type: string
 *                 enum: [wave, orange, free, mtn, moov, manual]
 *                 example: wave
 *               paymentMethodNumber:
 *                 type: string
 *                 example: "771234567"
 *               turnNumber:
 *                 type: number
 *                 description: Tour concerné (défaut = tour actuel)
 *                 example: 2
 *     responses:
 *       201:
 *         description: Paiement initié — retourne paymentId + délai de simulation
 *       400:
 *         description: Erreurs de validation
 *       403:
 *         description: Non membre actif
 */
router.post('/initiate', verifyToken, initiatePayment);

/**
 * @swagger
 * /payments/verify:
 *   post:
 *     summary: Vérifier et confirmer un paiement (simulation ou webhook)
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentId]
 *             properties:
 *               paymentId:
 *                 type: string
 *                 example: "xyz789"
 *               transactionId:
 *                 type: string
 *                 description: ID retourné par l'opérateur (requis en prod)
 *                 example: "WAVE-TXN-123456"
 *     responses:
 *       200:
 *         description: Paiement confirmé ou échoué
 *       400:
 *         description: Paiement déjà traité
 *       404:
 *         description: Paiement introuvable
 */
router.post('/verify', verifyToken, verifyPayment);

/**
 * @swagger
 * /payments/{paymentId}/receipt:
 *   get:
 *     summary: Récupérer le reçu d'un paiement confirmé
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Données complètes du reçu
 *       400:
 *         description: Paiement non confirmé
 *       403:
 *         description: Accès refusé
 *       404:
 *         description: Paiement introuvable
 */
router.get('/:paymentId/receipt', verifyToken, getPaymentReceipt);

/**
 * @swagger
 * /payments/{paymentId}/manual-verify:
 *   patch:
 *     summary: Valider ou rejeter un paiement manuel (créateur/admin uniquement)
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [verify, reject]
 *               reason:
 *                 type: string
 *                 description: Raison du refus (optionnel)
 *     responses:
 *       200:
 *         description: Paiement validé ou refusé
 *       403:
 *         description: Non autorisé
 */
router.patch('/:paymentId/manual-verify', verifyToken, manualVerifyPayment);

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: Historique de mes paiements
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tontineId
 *         schema:
 *           type: string
 *         description: Filtrer par tontine
 *     responses:
 *       200:
 *         description: Liste des paiements
 */
router.get('/', verifyToken, getMyPayments);

export default router;