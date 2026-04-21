import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import {
    createTontine, getMyTontines, getTontineById,
    updateTontine, deleteTontine, getTontineInvite,
    getJoinPreview, joinTontine, getTontineMembers, validateMember,
    getMemberProfile,
    processNextTurn,
    castVote,
    launchTontine
} from '../controllers/tontines.controller';
import { requirePremium } from '../middleware/premium.middleware';

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

/**
 * @swagger
 * /tontines/join/{code}:
 *   get:
 *     summary: Prévisualisation publique d'une tontine via code d'invitation (écran de jointure)
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []   # Optionnel selon ton middleware
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Code d'invitation de la tontine
 *     responses:
 *       200:
 *         description: Informations publiques de la tontine + statut de participation de l'utilisateur connecté (le cas échéant)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tontine:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     description: { type: string }
 *                     emoji: { type: string }
 *                     amount: { type: number }
 *                     frequency: { type: string }
 *                     totalMembers: { type: number }
 *                     currentMembers: { type: number }
 *                     visibility: { type: string }
 *                     status: { type: string }
 *                 isMember: { type: boolean }
 *                 canJoin: { type: boolean }
 *       404:
 *         description: Code d'invitation invalide ou tontine introuvable
 */
router.get('/join/:code', verifyToken, getJoinPreview);

/**
 * @swagger
 * /tontines/join/{code}:
 *   post:
 *     summary: Rejoindre une tontine via code d'invitation
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Code d'invitation
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Je souhaite rejoindre la tontine familiale"
 *     responses:
 *       201:
 *         description: Demande de participation envoyée avec succès (ou rejoint directement selon les règles)
 *       400:
 *         description: Code invalide, tontine complète, déjà membre, ou période de jointure terminée
 *       403:
 *         description: Non autorisé
 *       409:
 *         description: Demande déjà en cours ou déjà membre
 */
router.post('/join/:code', verifyToken, joinTontine);

/**
 * @swagger
 * /tontines/{id}/members:
 *   get:
 *     summary: Récupérer la liste des membres d'une tontine
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending_approval, active, rejected, left]
 *         description: Filtrer les membres par statut (utile pour l'admin/modérateur)
 *     responses:
 *       200:
 *         description: Liste des membres avec leurs informations et rôle
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   uid: { type: string }
 *                   name: { type: string }
 *                   phone: { type: string }
 *                   role: { type: string, enum: [creator, admin, member] }
 *                   status: { type: string }
 *                   joinedAt: { type: string, format: date-time }
 *                   contributionStatus: { type: string }
 *       403:
 *         description: Vous n'êtes pas membre de cette tontine
 *       404:
 *         description: Tontine introuvable
 */
router.get('/:id/members', verifyToken, getTontineMembers);

/**
 * @swagger
 * /tontines/{id}/members/{uid}/validate:
 *   patch:
 *     summary: Valider ou refuser un membre en attente (pour le créateur ou admin)
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la tontine
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *         description: UID de l'utilisateur à valider/refuser
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
 *                 enum: [approve, reject]
 *                 example: approve
 *               reason:
 *                 type: string
 *                 example: "Profil non conforme"
 *     responses:
 *       200:
 *         description: Action effectuée avec succès
 *       400:
 *         description: Action invalide ou membre déjà traité
 *       403:
 *         description: Vous n'avez pas les droits nécessaires (seul le créateur ou admin peut valider)
 *       404:
 *         description: Tontine ou membre introuvable
 */
router.patch('/:id/members/:uid/validate', verifyToken, validateMember);

/**
 * @swagger
 * /tontines/{id}/members/{uid}:
 *   get:
 *     summary: Récupérer le profil d'un membre spécifique
 *     description: Permet à un membre d'une tontine de consulter le profil d’un autre membre de la même tontine.
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la tontine
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *         description: UID du membre à consulter
 *     responses:
 *       200:
 *         description: Profil du membre récupéré avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     userName:
 *                       type: string
 *                       example: "Aminata Ba"
 *                     userPhotoUrl:
 *                       type: string
 *                       nullable: true
 *                     role:
 *                       type: string
 *                       enum: [creator, admin, member]
 *                     status:
 *                       type: string
 *                       enum: [active, pending_approval, rejected]
 *                     turnNumber:
 *                       type: number
 *                       nullable: true
 *                     joinedAt:
 *                       type: string
 *                       format: date-time
 *                     validatedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalPaid:
 *                           type: number
 *                         totalReceived:
 *                           type: number
 *                         onTimePayments:
 *                           type: number
 *                         latePayments:
 *                           type: number
 *                         missedPayments:
 *                           type: number
 *                         voteParticipation:
 *                           type: number
 *       403:
 *         description: Accès refusé (l'utilisateur n'est pas membre de la tontine)
 *       404:
 *         description: Tontine ou membre introuvable
 *       500:
 *         description: Erreur serveur
 */
router.get('/:id/members/:uid', verifyToken, getMemberProfile);

/**
 * @swagger
 * /tontines/{id}/next-turn:
 *   post:
 *     summary: Passer au tour suivant (créateur ou admin uniquement)
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la tontine
 *     responses:
 *       200:
 *         description: Passage au tour suivant effectué avec succès
 *       403:
 *         description: Non autorisé (seul le créateur ou admin peut effectuer cette action)
 *       404:
 *         description: Tontine introuvable
 *       400:
 *         description: Impossible de passer au tour suivant (conditions non remplies)
 */
router.post('/:id/next-turn', verifyToken, requirePremium, processNextTurn);

/**
 * @swagger
 * /tontines/{id}/votes/{voteId}/cast:
 *   post:
 *     summary: Participer à un vote consensuel dans une tontine
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la tontine
 *       - in: path
 *         name: voteId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du vote
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [choice]
 *             properties:
 *               choice:
 *                 type: string
 *                 enum: [yes, no]
 *                 example: yes
 *     responses:
 *       200:
 *         description: Vote enregistré avec succès
 *       400:
 *         description: Vote invalide ou déjà effectué
 *       403:
 *         description: Non autorisé
 *       404:
 *         description: Tontine ou vote introuvable
 */
// router.post('/:id/votes/:voteId/cast', verifyToken, castVote);

/**
 * @swagger
 * /tontines/{id}/launch:
 *   post:
 *     summary: Lancer une tontine (passer de "pending" à "active")
 *     description: Permet au créateur (ou admin selon règles) de démarrer la tontine une fois que toutes les conditions sont remplies (nombre de membres atteint, validations effectuées, etc.)
 *     tags: [Tontines]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la tontine à lancer
 *     responses:
 *       200:
 *         description: Tontine lancée avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Tontine lancée avec succès"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: active
 *                     startedAt:
 *                       type: string
 *                       format: date-time
 *                     firstTurnUserId:
 *                       type: string
 *                       description: UID du premier bénéficiaire (selon la méthode de rotation)
 *       400:
 *         description: Impossible de lancer la tontine (conditions non remplies,  membres insuffisants, validations en attente, etc.)
 *       403:
 *         description: Non autorisé (seul le créateur ou admin peut lancer la tontine)
 *       404:
 *         description: Tontine introuvable
 *       409:
 *         description: Tontine déjà lancée ou déjà active
 */
router.post('/:id/launch', verifyToken, launchTontine);

export default router;