import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import {
    sendOtp, verifyOtp, setupPin, completeProfile, loginWithPin, getProfile,
    updateProfile,
    getReferralLink,
    updatePin,
    getReferralStats
} from '../controllers/auth.controller';

const router = Router();

/**
 * @swagger
 * /auth/send-otp:
 *   post:
 *     summary: Envoyer un code OTP par SMS
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+221771234567"
 *     responses:
 *       200:
 *         description: OTP envoyé — retourne sessionInfo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 sessionInfo: { type: string, description: "À conserver pour verify-otp" }
 */
router.post('/send-otp', sendOtp);

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Vérifier le code OTP reçu par SMS
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionInfo, code, phoneNumber]
 *             properties:
 *               sessionInfo: { type: string }
 *               code:
 *                 type: string
 *                 example: "123456"
 *               phoneNumber:
 *                 type: string
 *                 example: "+221771234567"
 *     responses:
 *       200:
 *         description: OTP valide — retourne idToken + isNewUser
 */
router.post('/verify-otp', verifyOtp);

/**
 * @swagger
 * /auth/setup-pin:
 *   post:
 *     summary: Créer son code PIN (nouveau compte)
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pin]
 *             properties:
 *               pin:
 *                 type: string
 *                 example: "4829"
 *                 description: "4 chiffres, pas de suite ni répétition"
 *     responses:
 *       200:
 *         description: PIN créé et hashé avec bcrypt
 */
router.post('/setup-pin', verifyToken, setupPin);

/**
 * @swagger
 * /auth/complete-profile:
 *   post:
 *     summary: Compléter le profil utilisateur
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, birthDate]
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Ibrahima Sarr"
 *               email:
 *                 type: string
 *                 example: "ibrahima@gmail.com"
 *               birthDate:
 *                 type: string
 *                 format: date
 *                 example: "1995-03-15"
 *     responses:
 *       201:
 *         description: Profil complet — compte actif
 */
router.post('/complete-profile', verifyToken, completeProfile);

/**
 * @swagger
 * /auth/login-pin:
 *   post:
 *     summary: Se connecter avec numéro + PIN
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber, pin]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+221771234567"
 *               pin:
 *                 type: string
 *                 example: "4829"
 *     responses:
 *       200:
 *         description: Connexion réussie — retourne customToken
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 customToken:
 *                   type: string
 *                   description: "Utiliser avec signInWithCustomToken() côté Angular"
 */
router.post('/login-pin', loginWithPin);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     summary: Récupérer son profil complet
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profil utilisateur (sans pinHash)
 */
router.get('/profile', verifyToken, getProfile);

/**
 * @swagger
 * /auth/referral-link:
 *   get:
 *     summary: Obtenir son lien de parrainage
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lien de parrainage généré
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 referralLink:
 *                   type: string
 *                   example: "https://app.com/referral/abc123"
 */
router.get('/referral-link', verifyToken, getReferralLink);

/**
 * @swagger
 * /auth/update-profile:
 *   patch:
 *     summary: Mettre à jour les informations du profil utilisateur
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Aminata BA"
 *               email:
 *                 type: string
 *                 example: "aminata@gmail.com"
 *               birthDate:
 *                 type: string
 *                 format: date
 *                 example: "1998-07-21"
 *     responses:
 *       200:
 *         description: Profil mis à jour avec succès
 */
router.patch('/update-profile', verifyToken, updateProfile);

/**
 * @swagger
 * /auth/update-pin:
 *   patch:
 *     summary: Modifier son code PIN
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPin, newPin]
 *             properties:
 *               oldPin:
 *                 type: string
 *                 example: "1234"
 *               newPin:
 *                 type: string
 *                 example: "5678"
 *                 description: "4 chiffres, pas de suite ni répétition"
 *     responses:
 *       200:
 *         description: PIN mis à jour avec succès
 */
router.patch('/update-pin', verifyToken, updatePin);

router.get('/referral-stats', verifyToken, getReferralStats);

export default router;