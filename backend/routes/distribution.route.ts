import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import { requirePremium } from '../middleware/premium.middleware';
import {
    getTurnStatus,
    triggerDistribution,
    confirmDistribution,
    getDistribution,
    getDistributionsByTontine,
} from '../controllers/distribution.controller';

const router = Router();

/**
 * @swagger
 * /distributions/turn-status:
 *   get:
 *     summary: État de la collecte du tour courant (combien de membres ont payé)
 *     tags: [Distributions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tontineId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: turnNumber
 *         schema: { type: integer }
 *         description: Numéro de tour (défaut = tour courant)
 *     responses:
 *       200:
 *         description: >
 *           { totalMembers, paidCount, unpaidCount, isComplete,
 *             totalCollected, missingMembers[] }
 */
router.get('/turn-status', verifyToken, getTurnStatus);

/**
 * @swagger
 * /distributions/trigger:
 *   post:
 *     summary: Déclencher la distribution du pot (créateur/admin)
 *     description: >
 *       Vérifie que tous les membres ont payé le tour courant,
 *       puis envoie le pot au bénéficiaire via la méthode choisie (simulation).
 *       Si forcePartial=true, distribue le montant collecté même si incomplet.
 *     tags: [Distributions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tontineId, distributionMethod, beneficiaryPhone]
 *             properties:
 *               tontineId:
 *                 type: string
 *               distributionMethod:
 *                 type: string
 *                 enum: [wave, orange, free, manual]
 *               beneficiaryPhone:
 *                 type: string
 *                 example: "771234567"
 *               forcePartial:
 *                 type: boolean
 *                 default: false
 *                 description: Forcer la distribution même si collecte incomplète
 *     responses:
 *       201:
 *         description: Distribution créée — retourne distributionId + délai simulation
 *       400:
 *         description: Collecte incomplète ou distribution déjà existante
 *       403:
 *         description: Non autorisé (créateur/admin uniquement)
 */
router.post('/trigger', verifyToken, triggerDistribution);

/**
 * @swagger
 * /distributions/confirm:
 *   post:
 *     summary: Confirmer la réception du pot (bénéficiaire ou admin)
 *     description: >
 *       Le bénéficiaire confirme avoir reçu son pot.
 *       Déclenche automatiquement l'avancement au tour suivant.
 *     tags: [Distributions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [distributionId, tontineId]
 *             properties:
 *               distributionId:
 *                 type: string
 *               tontineId:
 *                 type: string
 *               transactionId:
 *                 type: string
 *                 description: ID opérateur (prod uniquement)
 *     responses:
 *       200:
 *         description: Réception confirmée — tour suivant démarré
 *       403:
 *         description: Non autorisé
 *       404:
 *         description: Distribution introuvable
 */
router.post('/confirm', verifyToken, confirmDistribution);

/**
 * @swagger
 * /distributions:
 *   get:
 *     summary: Historique des distributions d'une tontine
 *     tags: [Distributions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tontineId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des distributions triées par tour (desc)
 */
router.get('/', verifyToken, getDistributionsByTontine);

/**
 * @swagger
 * /distributions/{distributionId}:
 *   get:
 *     summary: Détails d'une distribution
 *     tags: [Distributions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: distributionId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: tontineId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Détails de la distribution
 */
router.get('/:distributionId', verifyToken, getDistribution);

export default router;