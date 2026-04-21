import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import {
    createVote,
    getVotes,
    getVoteById,
    castVote,
    closeVote,
    cancelVote,
} from '../controllers/vote.controller';

/**
 * Ce router est monté sur /api/v1/tontines/:id/votes
 * avec mergeParams: true pour accéder au :id de la tontine parente.
 *
 * Montage dans app.ts :
 *   app.use('/api/v1/tontines/:id/votes', voteRouter);
 */
const router = Router({ mergeParams: true });

/**
 * @swagger
 * /tontines/{id}/votes:
 *   get:
 *     summary: Lister les votes d'une tontine
 *     tags: [Votes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [open, closed, cancelled] }
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [next_turn_selection, rule_change, member_exclusion, early_dissolution, role_change, turn_swap]
 *     responses:
 *       200:
 *         description: Liste des votes triés par date décroissante
 */
router.get('/', verifyToken, getVotes);

/**
 * @swagger
 * /tontines/{id}/votes:
 *   post:
 *     summary: Créer un vote
 *     tags: [Votes]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, title]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [next_turn_selection, rule_change, member_exclusion, early_dissolution, role_change, turn_swap]
 *               title:
 *                 type: string
 *                 example: "Augmenter la cotisation à 10 000 FCFA ?"
 *               description:
 *                 type: string
 *               expiresInHours:
 *                 type: number
 *                 example: 48
 *               meta:
 *                 type: object
 *                 description: Métadonnées spécifiques au type de vote
 *     responses:
 *       201:
 *         description: Vote créé — tous les membres éligibles sont notifiés
 */
router.post('/', verifyToken, createVote);

/**
 * @swagger
 * /tontines/{id}/votes/{voteId}:
 *   get:
 *     summary: Détail d'un vote
 *     tags: [Votes]
 *     security:
 *       - BearerAuth: []
 */
router.get('/:voteId', verifyToken, getVoteById);

/**
 * @swagger
 * /tontines/{id}/votes/{voteId}/cast:
 *   post:
 *     summary: Voter sur une proposition
 *     tags: [Votes]
 *     security:
 *       - BearerAuth: []
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
 *                 description: "'yes' | 'no' pour la plupart des types, uid du candidat pour next_turn_selection"
 *                 example: "yes"
 *     responses:
 *       200:
 *         description: Vote enregistré — si le quorum est atteint, le vote est clôturé et l'effet appliqué automatiquement
 */
router.post('/:voteId/cast', verifyToken, castVote);

/**
 * @swagger
 * /tontines/{id}/votes/{voteId}/close:
 *   patch:
 *     summary: Clôturer manuellement un vote (admin/créateur)
 *     tags: [Votes]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Vote clôturé avec résultat calculé sur les votes reçus
 */
router.patch('/:voteId/close', verifyToken, closeVote);

/**
 * @swagger
 * /tontines/{id}/votes/{voteId}:
 *   delete:
 *     summary: Annuler un vote (créateur du vote, avant tout vote émis)
 *     tags: [Votes]
 *     security:
 *       - BearerAuth: []
 */
router.delete('/:voteId', verifyToken, cancelVote);

export default router;