import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import bcrypt from 'bcrypt';
import { db } from '../config/firebase';

const normalizePhoneNumber = (phone: string): string => {
    return phone.replace(/[\s-]/g, '');
};

// ─────────────────────────────────────────────
// ÉTAPE 1A — Envoyer l'OTP SMS
// POST /api/v1/auth/send-otp
// Body: { phoneNumber: "+221771234567" }
// ─────────────────────────────────────────────
export const sendOtp = async (req: Request, res: Response) => {

    const apiKey = process.env.FIREBASE_API_KEY;

    if (!apiKey) {
        throw new Error('FIREBASE_WEB_API_KEY is missing');
    }

    let { phoneNumber } = req.body;

    phoneNumber = normalizePhoneNumber(phoneNumber);

    if (!phoneNumber || !/^\+\d{10,15}$/.test(phoneNumber)) {
        return res.status(400).json({
            success: false,
            error: 'Numéro invalide. Format attendu : +221771234567',
        });
    }

    try {
        // Firebase génère un sessionInfo (nonce signé) côté serveur
        // L'OTP réel est envoyé par Firebase via l'Identity Toolkit
        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumber,
                    recaptchaToken: "safety-net"
                }),
            }
        );

        const data = await response.json();

        if (data.error) {
            return res.status(400).json({ success: false, error: data.error.message });
        }

        // sessionInfo doit être renvoyé par le client lors de la vérification
        return res.json({
            success: true,
            sessionInfo: data.sessionInfo,
            message: `Code OTP envoyé au ${phoneNumber}`,
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// ÉTAPE 1B — Vérifier le code OTP
// POST /api/v1/auth/verify-otp
// Body: { sessionInfo, code, phoneNumber }
// ─────────────────────────────────────────────
export const verifyOtp = async (req: Request, res: Response) => {

    let { sessionInfo, code, phoneNumber } = req.body;

    phoneNumber = normalizePhoneNumber(phoneNumber);

    if (!sessionInfo || !code || !phoneNumber) {
        return res.status(400).json({
            success: false,
            error: 'sessionInfo, code et phoneNumber sont requis',
        });
    }

    try {
        // Vérification OTP via Firebase Identity Toolkit
        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${process.env.FIREBASE_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionInfo, code, phoneNumber }),
            }
        );

        const data = await response.json();

        if (data.error) {
            return res.status(400).json({
                success: false,
                error: 'Code OTP invalide ou expiré',
            });
        }

        const uid = data.localId;
        const idToken = data.idToken;

        // Vérifier si l'utilisateur existe déjà dans Firestore
        const userDoc = await db.collection('users').doc(uid).get();
        const isNewUser = !userDoc.exists;

        if (isNewUser) {
            // Créer un document minimal — il sera complété par /complete-profile
            await db.collection('users').doc(uid).set({
                uid,
                phoneNumber,
                isVerified: true,
                profileComplete: false,
                pinSet: false,
                reputationScore: 5.0,
                punctualityRate: 100,
                totalTontines: 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        return res.json({
            success: true,
            idToken,           // JWT Firebase à stocker côté client
            uid,
            isNewUser,         // true → rediriger vers setup-pin, false → login-pin
            profileComplete: isNewUser ? false : userDoc.data()?.profileComplete,
            pinSet: isNewUser ? false : userDoc.data()?.pinSet,
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// ÉTAPE 2A — Créer le code PIN (nouveau compte)
// POST /api/v1/auth/setup-pin
// Header: Authorization: Bearer <idToken>
// Body: { pin: "1234" }
// ─────────────────────────────────────────────
export const setupPin = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { pin } = req.body;

    // Validation du PIN
    if (!pin || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({
            success: false,
            error: 'Le PIN doit contenir exactement 4 chiffres',
        });
    }

    // Refuser les suites (1234, 4321) et les répétitions (1111)
    const isSuite = ['0123', '1234', '2345', '3456', '4567', '5678', '6789',
        '9876', '8765', '7654', '6543', '5432', '4321', '3210'].includes(pin);
    const isRepeat = /^(\d)\1{3}$/.test(pin);

    if (isSuite || isRepeat) {
        return res.status(400).json({
            success: false,
            error: 'PIN trop simple. Évitez les suites (1234) et répétitions (1111)',
        });
    }

    try {
        // Hasher le PIN avec bcrypt (saltRounds = 10)
        const pinHash = await bcrypt.hash(pin, 10);

        await db.collection('users').doc(uid).update({
            pinHash,
            pinSet: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({
            success: true,
            message: 'Code PIN créé avec succès',
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// ÉTAPE 2B — Compléter le profil
// POST /api/v1/auth/complete-profile
// Header: Authorization: Bearer <idToken>
// Body: { fullName, email?, birthDate }
// ─────────────────────────────────────────────
export const completeProfile = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { fullName, email, birthDate } = req.body;

    // Validation
    if (!fullName || fullName.trim().length < 2) {
        return res.status(400).json({
            success: false,
            error: 'Le nom complet est requis (min 2 caractères)',
        });
    }

    if (!birthDate || isNaN(Date.parse(birthDate))) {
        return res.status(400).json({
            success: false,
            error: 'Date de naissance invalide. Format : YYYY-MM-DD',
        });
    }

    // Vérifier majorité (18 ans minimum)
    const birth = new Date(birthDate);
    const age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (age < 18) {
        return res.status(400).json({
            success: false,
            error: 'Vous devez avoir au moins 18 ans pour utiliser Tontine Plus',
        });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
            success: false,
            error: 'Format email invalide',
        });
    }

    try {
        // Générer un code de parrainage unique
        const referralCode = fullName.split(' ')[0].toUpperCase().slice(0, 4)
            + Math.floor(1000 + Math.random() * 9000);

        const updateData: Record<string, any> = {
            fullName: fullName.trim(),
            birthDate: admin.firestore.Timestamp.fromDate(new Date(birthDate)),
            referralCode,
            profileComplete: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (email) updateData.email = email.toLowerCase().trim();

        await db.collection('users').doc(uid).update(updateData);

        // Mettre à jour Firebase Auth (displayName)
        await admin.auth().updateUser(uid, {
            displayName: fullName.trim(),
            ...(email ? { email: email.toLowerCase().trim() } : {}),
        });

        // Retourner le profil complet
        const userDoc = await db.collection('users').doc(uid).get();

        return res.status(201).json({
            success: true,
            message: 'Profil créé avec succès',
            data: { uid, ...userDoc.data() },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// ÉTAPE 3 — Connexion par PIN (sessions suivantes)
// POST /api/v1/auth/login-pin
// Body: { phoneNumber, pin }
// ─────────────────────────────────────────────
export const loginWithPin = async (req: Request, res: Response) => {
    const { phoneNumber, pin } = req.body;

    if (!phoneNumber || !pin) {
        return res.status(400).json({
            success: false,
            error: 'phoneNumber et pin sont requis',
        });
    }

    try {
        // 1. Retrouver l'utilisateur par numéro de téléphone dans Firebase Auth
        const firebaseUser = await admin.auth().getUserByPhoneNumber(phoneNumber);
        const uid = firebaseUser.uid;

        // 2. Récupérer le hash du PIN depuis Firestore
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: 'Compte introuvable' });
        }

        const userData = userDoc.data()!;

        if (!userData.pinSet || !userData.pinHash) {
            return res.status(400).json({
                success: false,
                error: 'Aucun PIN configuré. Utilisez le flux OTP.',
            });
        }

        // 3. Comparer le PIN saisi avec le hash bcrypt
        const pinMatch = await bcrypt.compare(pin, userData.pinHash);

        if (!pinMatch) {
            return res.status(401).json({
                success: false,
                error: 'PIN incorrect',
            });
        }

        // 4. Générer un Custom Token Firebase → le client l'échange contre un idToken
        const customToken = await admin.auth().createCustomToken(uid);

        // Mettre à jour lastLoginAt
        await db.collection('users').doc(uid).update({
            lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({
            success: true,
            customToken,  // Le client Angular fait signInWithCustomToken(customToken)
            uid,
            profile: {
                fullName: userData.fullName,
                phoneNumber: userData.phoneNumber,
                reputationScore: userData.reputationScore,
                profileComplete: userData.profileComplete,
            },
        });
    } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
            return res.status(404).json({
                success: false,
                error: 'Aucun compte associé à ce numéro',
            });
        }
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// BONUS — Récupérer son profil
// GET /api/v1/auth/me
// Header: Authorization: Bearer <idToken>
// ─────────────────────────────────────────────
export const getProfile = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    try {
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: 'Profil introuvable' });
        }

        // Ne jamais retourner le pinHash au client
        const { pinHash, ...safeData } = userDoc.data() as any;

        return res.json({ success: true, data: safeData });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};