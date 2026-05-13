import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import bcrypt from 'bcrypt';
import { db } from '../config/firebase';
import { buildNotificationDoc, sendNotificationToUser } from '../services/notification.service';

const normalizePhoneNumber = (phone: string): string => {
    return phone.replace(/[\s-]/g, '');
};

const capitalizeWords = (str: string): string => {
    return str
        .trim()
        .toLowerCase()
        .split(' ')
        .filter(word => word.length > 0)       // ignore les espaces multiples
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

const REFERRAL_CONFIG = {
    referrerRewardDays: 15,      // +15j pour le parrain par filleul
    refereeRewardDays: 15,       // +15j pour le filleul à l'inscription
    maxReferrals: 5,             // Max 5 filleuls par utilisateur
    triggerEvent: 'paid_subscription' as const,
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

        const userDoc = await db.collection('users').doc(uid).get();
        const isNewUser = !userDoc.exists;

        if (isNewUser) {
            // Créer un document minimal — photo et abonnement ajoutés à /complete-profile
            await db.collection('users').doc(uid).set({
                uid,
                phoneNumber,
                isVerified: true,
                profileComplete: false,
                pinSet: false,
                photoUrl: null,
                reputationScore: 5.0,
                punctualityRate: 100,
                totalTontines: 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        return res.json({
            success: true,
            idToken,
            uid,
            isNewUser,
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

    if (!pin || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({
            success: false,
            error: 'Le PIN doit contenir exactement 4 chiffres',
        });
    }

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
// Body: { fullName, email?, birthDate, photoUrl?, plan? }
//
// photoUrl  : URL Firebase Storage uploadée côté client avant cet appel (optionnel)
// plan      : 'monthly' | 'annual' | 'premium' — défaut 'monthly' si absent
// ─────────────────────────────────────────────
export const completeProfile = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { fullName, email, birthDate, photoUrl, plan } = req.body;

    // ── Validation ────────────────────────────────────────────
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

    // Valider l'URL de la photo si fournie
    if (photoUrl) {
        const isUrl = /^https?:\/\/.+/.test(photoUrl);
        const isBase64 = /^data:image\/(jpeg|jpg|png|webp);base64,/.test(photoUrl);
        if (!isUrl && !isBase64) {
            return res.status(400).json({ success: false, error: 'URL de photo invalide' });
        }
    }

    const validPlans = ['monthly', 'annual', 'premium'];
    const selectedPlan: 'monthly' | 'annual' | 'premium' =
        validPlans.includes(plan) ? plan : 'monthly';

    try {
        const referralCode = fullName.split(' ')[0].toUpperCase().slice(0, 4)
            + Math.floor(1000 + Math.random() * 9000);

        // ── Dates d'abonnement ────────────────────────────────
        const now = new Date();
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + 14); // 14 jours d'essai gratuit

        const periodEnd = new Date(now);
        if (selectedPlan === 'annual') {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        // Montants en XOF selon le plan
        const planAmounts: Record<string, number> = {
            monthly: 2000,
            annual: 20000,
            premium: 5000,
        };

        const subscriptionRef = db.collection('subscriptions').doc();

        // ── Transaction : profil + abonnement ────────────────
        await db.runTransaction(async (transaction) => {

            // 1. Mise à jour du profil utilisateur
            const userRef = db.collection('users').doc(uid);
            const userUpdate: Record<string, any> = {
                fullName: capitalizeWords(fullName),
                birthDate: admin.firestore.Timestamp.fromDate(new Date(birthDate)),
                referralCode,
                profileComplete: true,
                photoUrl: photoUrl ?? null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            if (email) userUpdate.email = email.toLowerCase().trim();
            transaction.update(userRef, userUpdate);

            // 2. Création de l'abonnement
            transaction.set(subscriptionRef, {
                id: subscriptionRef.id,
                userId: uid,
                plan: selectedPlan,
                status: 'trialing',
                amount: planAmounts[selectedPlan],
                currency: 'XOF',
                interval: selectedPlan === 'annual' ? 'year' : 'month',
                currentPeriodStart: admin.firestore.Timestamp.fromDate(now),
                currentPeriodEnd: admin.firestore.Timestamp.fromDate(trialEnd),
                cancelAtPeriodEnd: false,
                paymentMethod: 'manual',
                transactionId: null,
                receiptUrl: null,
                subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
                canceledAt: null,
                expiresAt: admin.firestore.Timestamp.fromDate(trialEnd),
                previousPlans: [],
            });
        });

        // Mettre à jour Firebase Auth
        const isRealUrl = photoUrl && /^https?:\/\/.+/.test(photoUrl);
        await admin.auth().updateUser(uid, {
            displayName: fullName.trim(),
            ...(isRealUrl ? { photoURL: photoUrl } : {}),
            ...(email ? { email: email.toLowerCase().trim() } : {}),
        });

        // ── Notification de bienvenue ──────────────────────────────
        try {
            const welcomeNotif = buildNotificationDoc(uid, {
                title: `Bienvenue ${capitalizeWords(fullName).split(' ')[0]} 🎉`,
                body: `Votre compte est créé ! Profitez de 14 jours d'essai gratuit pour découvrir toutes les fonctionnalités de Tontine Plus.`,
                type: 'welcome',
                senderUid: 'system',
            });

            await db.collection('notifications').doc(welcomeNotif.ref.id).set(welcomeNotif.data);
            await sendNotificationToUser(uid, welcomeNotif.data);
        } catch (notifErr) {
            // Ne pas bloquer l'inscription si la notif échoue
            console.error('[Welcome notif] Erreur:', notifErr);
        }

        const userDoc = await db.collection('users').doc(uid).get();

        return res.status(201).json({
            success: true,
            message: 'Profil créé avec succès',
            data: {
                uid,
                ...userDoc.data(),
                subscription: {
                    id: subscriptionRef.id,
                    plan: selectedPlan,
                    status: 'trialing',
                },
            },
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
        const firebaseUser = await admin.auth().getUserByPhoneNumber(phoneNumber);
        const uid = firebaseUser.uid;

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

        const pinMatch = await bcrypt.compare(pin, userData.pinHash);

        if (!pinMatch) {
            return res.status(401).json({
                success: false,
                error: 'PIN incorrect',
            });
        }

        const customToken = await admin.auth().createCustomToken(uid);

        await db.collection('users').doc(uid).update({
            lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({
            success: true,
            customToken,
            uid,
            profile: {
                fullName: userData.fullName,
                phoneNumber: userData.phoneNumber,
                photoUrl: userData.photoUrl ?? null,
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

        // Récupérer l'abonnement actif
        const subscriptionSnap = await db
            .collection('subscriptions')
            .where('userId', '==', uid)
            .where('status', 'in', ['active', 'trialing'])
            .orderBy('subscribedAt', 'desc')
            .limit(1)
            .get();

        let subscription = null;

        if (subscriptionSnap.docs.length > 0) {
            const doc = subscriptionSnap.docs[0];
            subscription = {
                id: doc?.id,
                ...doc?.data()
            };
        }
        return res.json({ success: true, data: { ...safeData, subscription } });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// UPDATE PROFILE
// PATCH /api/v1/auth/update-profile
// Header: Authorization: Bearer <idToken>
// Body: { fullName?, email?, birthDate?, photoUrl? }
// ─────────────────────────────────────────────
export const updateProfile = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { fullName, email, birthDate, photoUrl } = req.body;

    const updates: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const authUpdates: admin.auth.UpdateRequest = {};

    if (fullName !== undefined) {
        if (fullName.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Le nom complet doit contenir au moins 2 caractères',
            });
        }
        updates.fullName = capitalizeWords(fullName);
        authUpdates.displayName = fullName.trim();
    }

    if (email !== undefined) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, error: 'Format email invalide' });
        }
        updates.email = email.toLowerCase().trim();
        authUpdates.email = email.toLowerCase().trim();
    }

    if (birthDate !== undefined) {
        if (isNaN(Date.parse(birthDate))) {
            return res.status(400).json({
                success: false,
                error: 'Date de naissance invalide. Format : YYYY-MM-DD',
            });
        }
        const age = Math.floor(
            (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000)
        );
        if (age < 18) {
            return res.status(400).json({
                success: false,
                error: 'Vous devez avoir au moins 18 ans',
            });
        }
        updates.birthDate = admin.firestore.Timestamp.fromDate(new Date(birthDate));
    }

    if (photoUrl !== undefined) {
        if (photoUrl) {
            const isUrl = /^https?:\/\/.+/.test(photoUrl);
            const isBase64 = /^data:image\/(jpeg|jpg|png|webp);base64,/.test(photoUrl);
            if (!isUrl && !isBase64) {
                return res.status(400).json({ success: false, error: 'URL de photo invalide' });
            }
            if (isUrl) {
                authUpdates.photoURL = photoUrl;
            }
        }
        updates.photoUrl = photoUrl ?? null;
    }

    try {
        await db.collection('users').doc(uid).update(updates);
        if (Object.keys(authUpdates).length > 0) {
            await admin.auth().updateUser(uid, authUpdates);
        }

        const userDoc = await db.collection('users').doc(uid).get();
        const { pinHash, ...safeData } = userDoc.data() as any;

        return res.json({
            success: true,
            message: 'Profil mis à jour avec succès',
            data: safeData,
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// UPDATE PIN
// PATCH /api/v1/auth/update-pin
// Header: Authorization: Bearer <idToken>
// Body: { currentPin, newPin }
// ─────────────────────────────────────────────
export const updatePin = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { currentPin, newPin } = req.body;

    if (!currentPin || !newPin) {
        return res.status(400).json({
            success: false,
            error: 'currentPin et newPin sont requis',
        });
    }

    if (!/^\d{4}$/.test(newPin)) {
        return res.status(400).json({
            success: false,
            error: 'Le nouveau PIN doit contenir exactement 4 chiffres',
        });
    }

    const suites = ['0123', '1234', '2345', '3456', '4567', '5678', '6789',
        '9876', '8765', '7654', '6543', '5432', '4321', '3210'];
    if (suites.includes(newPin) || /^(\d)\1{3}$/.test(newPin)) {
        return res.status(400).json({
            success: false,
            error: 'PIN trop simple. Évitez les suites (1234) et répétitions (1111)',
        });
    }

    if (currentPin === newPin) {
        return res.status(400).json({
            success: false,
            error: 'Le nouveau PIN doit être différent de l\'ancien',
        });
    }

    try {
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: 'Compte introuvable' });
        }

        const userData = userDoc.data()!;

        if (!userData.pinHash) {
            return res.status(400).json({
                success: false,
                error: 'Aucun PIN configuré. Utilisez /setup-pin.',
            });
        }

        const pinMatch = await bcrypt.compare(currentPin, userData.pinHash);
        if (!pinMatch) {
            return res.status(401).json({ success: false, error: 'PIN actuel incorrect' });
        }

        const newPinHash = await bcrypt.hash(newPin, 10);

        await db.collection('users').doc(uid).update({
            pinHash: newPinHash,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({ success: true, message: 'Code PIN mis à jour avec succès' });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// REFRESH TOKEN
// POST /api/v1/auth/refresh
// Body: { refreshToken }
// ─────────────────────────────────────────────

export const refreshToken = async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({ success: false, error: 'refreshToken requis' });
    }

    try {
        const response = await fetch(
            `https://securetoken.googleapis.com/v1/token?key=${process.env.FIREBASE_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                }),
            }
        );

        const data = await response.json();

        if (data.error) {
            return res.status(401).json({ success: false, error: 'Session expirée, reconnectez-vous' });
        }

        return res.json({
            success: true,
            data: {
                idToken: data.id_token,
                refreshToken: data.refresh_token,
                expiresIn: data.expires_in,
            },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// SHARE — Générer le lien de parrainage
// GET /api/v1/auth/referral-link
// Header: Authorization: Bearer <idToken>
// ─────────────────────────────────────────────
export const getReferralLink = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    try {
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: 'Compte introuvable' });
        }

        const { referralCode, referralCount = 0 } = userDoc.data() as any;

        if (!referralCode) {
            return res.status(400).json({
                success: false,
                error: 'Aucun code de parrainage trouvé. Complétez votre profil.',
            });
        }

        const baseUrl = process.env.APP_DEEP_LINK_URL ?? 'https://tontineplus.app';
        const referralLink = `${baseUrl}/register?ref=${referralCode}`;

        const shareText =
            `Rejoins-moi sur Tontine Plus.\n` +
            `Définis tes propres règles de gestion de tontine et partage avec les personnes en qui tu as confiance.\n` +
            `Utilise mon code ${referralCode} à l'inscription et profite de 14 jours d'essai offerts !\n` +
            `${referralLink}`;

        return res.json({
            success: true,
            data: {
                referralCode,
                referralLink,
                shareText,
                referralCount,           // nb de filleuls déjà actifs
                rewardPerReferral: '1 mois offert',
            },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/auth/referral-stats
// Retourne les stats de parrainage de l'utilisateur connecté
// ─────────────────────────────────────────────────────────────
export const getReferralStats = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: 'Compte introuvable' });
        }

        const userData = userDoc.data() as any;

        // Récupérer les filleuls (ceux qui ont utilisé le code)
        const refereesSnap = await db
            .collection('users')
            .where('referredBy', '==', uid)
            .orderBy('createdAt', 'desc')
            .get();

        const referees = refereesSnap.docs.map(doc => {
            const d = doc.data() as any;
            return {
                uid: doc.id,
                fullName: d.fullName ?? 'Utilisateur',
                joinedAt: d.createdAt ?? null,
                // true = a activé un abonnement payant et le parrain a été récompensé
                rewardClaimed: d.referralRewardClaimed === true && d.referralRewardSkipped !== true,
                // false = inscrit mais pas encore payant
                isPending: !d.referralRewardClaimed,
            };
        });

        const rewardedCount: number = userData.referralRewardedCount ?? 0;
        const totalDaysEarned: number = userData.totalReferralDaysEarned ?? 0;
        const remainingSlots = Math.max(0, REFERRAL_CONFIG.maxReferrals - (userData.referralCount ?? 0));

        const baseUrl = process.env.APP_DEEP_LINK_URL ?? 'https://tontineplus.app';
        const referralLink = `${baseUrl}/register?ref=${userData.referralCode}`;

        return res.json({
            success: true,
            data: {
                referralCode: userData.referralCode,
                referralLink,
                referralCount: userData.referralCount ?? 0,       // filleuls inscrits
                rewardedCount,                                      // filleuls ayant payé
                totalDaysEarned,                                    // total jours gagnés
                maxReferrals: REFERRAL_CONFIG.maxReferrals,
                remainingSlots,                                     // slots restants
                rewardPerReferral: REFERRAL_CONFIG.referrerRewardDays,
                referees,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};