import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import {
    getMySubscription,
    getAvailablePlans,
    activateSubscription,
    changePlan,
    cancelSubscription,
    reactivateSubscription,
    checkAccess,
    getSubscriptionHistory,
    expireTrials,
    applyReferral,
    simulateSubscription,
} from '../controllers/subscription.controller';

const router = Router();

router.post('/simulate', verifyToken, simulateSubscription);

/**
 * @swagger
 * /subscriptions/plans:
 *   get:
 *     summary: Récupérer les plans d’abonnement disponibles
 *     tags: [Subscriptions]
 *     responses:
 *       200:
 *         description: Liste des plans disponibles
 */
router.get('/plans', getAvailablePlans);

/**
 * @swagger
 * /subscriptions/me:
 *   get:
 *     summary: Récupérer son abonnement actuel
 *     tags: [Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Abonnement actuel de l’utilisateur
 */
router.get('/me', verifyToken, getMySubscription);

/**
 * @swagger
 * /subscriptions/history:
 *   get:
 *     summary: Récupérer l’historique des abonnements
 *     tags: [Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Historique des abonnements
 */
router.get('/history', verifyToken, getSubscriptionHistory);

/**
 * @swagger
 * /subscriptions/access:
 *   get:
 *     summary: Vérifier l’accès aux fonctionnalités premium
 *     tags: [Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Statut d’accès (true/false)
 */
router.get('/access', verifyToken, checkAccess);

/**
 * @swagger
 * /subscriptions/activate:
 *   post:
 *     summary: Activer un abonnement
 *     tags: [Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId]
 *             properties:
 *               planId:
 *                 type: string
 *                 example: "premium_monthly"
 *     responses:
 *       200:
 *         description: Abonnement activé avec succès
 */
router.post('/activate', verifyToken, activateSubscription);

/**
 * @swagger
 * /subscriptions/change-plan:
 *   post:
 *     summary: Changer de plan d’abonnement
 *     tags: [Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPlanId]
 *             properties:
 *               newPlanId:
 *                 type: string
 *                 example: "premium_yearly"
 *     responses:
 *       200:
 *         description: Plan modifié avec succès
 */
router.post('/change-plan', verifyToken, changePlan);

/**
 * @swagger
 * /subscriptions/cancel:
 *   post:
 *     summary: Annuler son abonnement
 *     tags: [Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Abonnement annulé
 */
router.post('/cancel', verifyToken, cancelSubscription);

/**
 * @swagger
 * /subscriptions/reactivate:
 *   post:
 *     summary: Réactiver un abonnement annulé
 *     tags: [Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Abonnement réactivé
 */
router.post('/reactivate', verifyToken, reactivateSubscription);

/**
 * @swagger
 * /subscriptions/referral:
 *   post:
 *     summary: Appliquer un code de parrainage
 *     tags: [Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [referralCode]
 *             properties:
 *               referralCode:
 *                 type: string
 *                 example: "ABC123"
 *     responses:
 *       200:
 *         description: Code de parrainage appliqué
 */
router.post('/referral', verifyToken, applyReferral);

/**
 * @swagger
 * /subscriptions/expire-trials:
 *   post:
 *     summary: Expirer les essais gratuits (cron interne)
 *     tags: [Subscriptions]
 *     description: Endpoint utilisé par un cron (Cloud Scheduler)
 *     responses:
 *       200:
 *         description: Essais expirés avec succès
 */
router.post('/expire-trials', expireTrials);



export default router;