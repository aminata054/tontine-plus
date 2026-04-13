import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const PLANS = {
    monthly: { amount: 2000, interval: 'month', label: 'Mensuel' },
    annual: { amount: 20000, interval: 'year', label: 'Annuel' },
    premium: { amount: 5000, interval: 'month', label: 'Premium' },
} as const;

const REFERRAL_CONFIG = {
    referrerRewardDays: 15,      // +15j pour le parrain par filleul
    refereeRewardDays: 15,       // +15j pour le filleul à l'inscription
    maxReferrals: 5,             // Max 5 filleuls par utilisateur
    triggerEvent: 'paid_subscription' as const,
};

type PlanKey = keyof typeof PLANS;
type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';

// ─────────────────────────────────────────────────────────────
// UTILITAIRES PRIVÉS
// ─────────────────────────────────────────────────────────────

/** Calcule la date de fin de période selon le plan */
const computePeriodEnd = (from: Date, plan: PlanKey): Date => {
    const d = new Date(from);
    if (plan === 'annual') {
        d.setFullYear(d.getFullYear() + 1);
    } else {
        d.setMonth(d.getMonth() + 1);
    }
    return d;
};

/** Retourne true si le statut est considéré comme "accès actif" */
const isAccessible = (status: SubscriptionStatus, expiresAt: admin.firestore.Timestamp | null): boolean => {
    if (status === 'trialing') {
        return expiresAt ? expiresAt.toDate() > new Date() : false;
    }
    return status === 'active';
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/subscriptions/me — MON ABONNEMENT ACTUEL
// ─────────────────────────────────────────────────────────────
export const getMySubscription = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    try {
        const snap = await db
            .collection('subscriptions')
            .where('userId', '==', uid)
            .orderBy('subscribedAt', 'desc') // Index Firestore requis : userId ASC + subscribedAt DESC
            .limit(1)
            .get();

        if (snap.empty) {
            return res.status(404).json({
                success: false,
                error: 'Aucun abonnement trouvé',
            });
        }

        const doc = snap.docs[0];
        if (!doc) {
            return res.status(404).json({
                success: false,
                error: 'Aucun abonnement trouvé',
            });
        }
        const sub = doc.data() as any;

        // Vérifier si la trial a expiré côté serveur pour l'exposer proprement
        const now = new Date();
        let effectiveStatus: SubscriptionStatus = sub.status;

        if (sub.status === 'trialing' && sub.expiresAt?.toDate() < now) {
            effectiveStatus = 'expired';
        } else if (sub.status === 'active' && sub.currentPeriodEnd?.toDate() < now) {
            effectiveStatus = 'past_due';
        }

        const hasAccess = isAccessible(effectiveStatus, sub.expiresAt);

        // Jours restants
        let daysRemaining: number | null = null;
        if (effectiveStatus === 'trialing' && sub.expiresAt) {
            daysRemaining = Math.max(
                0,
                Math.ceil((sub.expiresAt.toDate().getTime() - now.getTime()) / 86400000)
            );
        } else if (effectiveStatus === 'active' && sub.currentPeriodEnd) {
            daysRemaining = Math.max(
                0,
                Math.ceil((sub.currentPeriodEnd.toDate().getTime() - now.getTime()) / 86400000)
            );
        }

        return res.json({
            success: true,
            data: {
                id: doc.id,
                ...sub,
                effectiveStatus,
                hasAccess,
                daysRemaining,
                planDetails: PLANS[sub.plan as PlanKey] ?? null,
            },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/subscriptions/plans — PLANS DISPONIBLES
// ─────────────────────────────────────────────────────────────
export const getAvailablePlans = async (_req: Request, res: Response) => {
    return res.json({
        success: true,
        data: [
            {
                id: 'monthly',
                label: 'Mensuel',
                amount: 2000,
                currency: 'XOF',
                interval: 'month',
                description: 'Accès complet, renouvelé chaque mois',
                trialDays: 14,
                savings: null,
            },
            {
                id: 'annual',
                label: 'Annuel',
                amount: 20000,
                currency: 'XOF',
                interval: 'year',
                description: 'Économisez 4 000 XOF par rapport au mensuel',
                trialDays: 14,
                savings: 4000,
            },
            {
                id: 'premium',
                label: 'Premium',
                amount: 5000,
                currency: 'XOF',
                interval: 'month',
                description: 'Fonctionnalités avancées + support prioritaire',
                trialDays: 14,
                savings: null,
            },
        ],
    });
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/subscriptions/activate — ACTIVER / RENOUVELER
//
// Appelé après un paiement mobile money (Orange Money, Wave…)
// Body: { plan, transactionId, receiptUrl? }
//
// Flux :
//   1. Valider les paramètres
//   2. Vérifier que transactionId n'a pas déjà été utilisé (idempotence)
//   3. Chercher l'abonnement courant
//   4. Transaction Firestore : mettre à jour ou créer le document subscription
// ─────────────────────────────────────────────────────────────
export const activateSubscription = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { plan, transactionId, receiptUrl } = req.body;

    // ── Validation ────────────────────────────────────────────
    if (!plan || !PLANS[plan as PlanKey]) {
        return res.status(400).json({
            success: false,
            error: `plan invalide, valeurs acceptées : ${Object.keys(PLANS).join(' | ')}`,
        });
    }

    if (!transactionId || typeof transactionId !== 'string' || transactionId.trim().length < 4) {
        return res.status(400).json({
            success: false,
            error: 'transactionId requis (référence du paiement mobile money)',
        });
    }

    if (receiptUrl && !/^https?:\/\/.+/.test(receiptUrl)) {
        return res.status(400).json({
            success: false,
            error: 'receiptUrl invalide (doit commencer par http:// ou https://)',
        });
    }

    try {
        // ── Idempotence : un transactionId ne peut activer qu'une seule fois ──
        const dupCheck = await db
            .collection('subscriptions')
            .where('transactionId', '==', transactionId.trim())
            .limit(1)
            .get();

        if (!dupCheck.empty) {
            return res.status(409).json({
                success: false,
                error: 'Ce transactionId a déjà été utilisé',
            });
        }

        // ── Récupérer l'abonnement courant ────────────────────
        const currentSnap = await db
            .collection('subscriptions')
            .where('userId', '==', uid)
            .orderBy('subscribedAt', 'desc') // Index Firestore requis : userId ASC + subscribedAt DESC
            .limit(1)
            .get();

        const now = new Date();
        const selectedPlan = plan as PlanKey;
        const planConfig = PLANS[selectedPlan];
        const periodEnd = computePeriodEnd(now, selectedPlan);

        let subscriptionDocId: string;
        let previousPlans: string[] = [];

        if (currentSnap.empty) {
            // Premier abonnement (cas rare : l'essai aurait dû créer un doc)
            subscriptionDocId = db.collection('subscriptions').doc().id;
        } else {
            const currentDoc = currentSnap.docs[0];
            if (!currentDoc) {
                return res.status(404).json({
                    success: false,
                    error: 'Aucun abonnement trouvé',
                });
            }
            subscriptionDocId = currentDoc.id;
            const currentData = currentDoc.data();
            previousPlans = currentData.previousPlans ?? [];
            if (currentData.plan && currentData.plan !== selectedPlan) {
                previousPlans = [...previousPlans, currentData.plan];
            }
        }

        const subRef = db.collection('subscriptions').doc(subscriptionDocId);

        await db.runTransaction(async (transaction) => {
            transaction.set(subRef, {
                id: subscriptionDocId,
                userId: uid,
                plan: selectedPlan,
                status: 'active',
                amount: planConfig.amount,
                currency: 'XOF',
                interval: planConfig.interval,
                currentPeriodStart: admin.firestore.Timestamp.fromDate(now),
                currentPeriodEnd: admin.firestore.Timestamp.fromDate(periodEnd),
                cancelAtPeriodEnd: false,
                paymentMethod: 'mobile_money',
                transactionId: transactionId.trim(),
                receiptUrl: receiptUrl ?? null,
                subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
                canceledAt: null,
                expiresAt: null, // plus en trial
                previousPlans,
                activatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: false });

            // Récompenser le parrain si toutes les conditions sont remplies
            await rewardReferrer(uid, transaction);


            // Notification d'activation
            const notifRef = db.collection('notifications').doc();
            transaction.set(notifRef, {
                id: notifRef.id,
                type: 'subscription_activated',
                recipientUid: uid,
                plan: selectedPlan,
                amount: planConfig.amount,
                periodEnd: admin.firestore.Timestamp.fromDate(periodEnd),
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });

        return res.status(200).json({
            success: true,
            message: `Abonnement ${planConfig.label} activé avec succès`,
            data: {
                subscriptionId: subscriptionDocId,
                plan: selectedPlan,
                status: 'active',
                currentPeriodEnd: periodEnd.toISOString(),
                amount: planConfig.amount,
                currency: 'XOF',
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/subscriptions/change-plan — CHANGER DE PLAN
//
// Body: { newPlan }
// Règles :
//   - Uniquement si abonnement actif
//   - Le changement prend effet à la prochaine période
//   - Si upgrade (monthly → annual), on peut l'appliquer immédiatement
// ─────────────────────────────────────────────────────────────
export const changePlan = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { newPlan } = req.body;

    if (!newPlan || !PLANS[newPlan as PlanKey]) {
        return res.status(400).json({
            success: false,
            error: `newPlan invalide — valeurs acceptées : ${Object.keys(PLANS).join(' | ')}`,
        });
    }

    try {
        const snap = await db
            .collection('subscriptions')
            .where('userId', '==', uid)
            .where('status', 'in', ['active', 'trialing'])
            .orderBy('subscribedAt', 'desc') // Index Firestore requis : userId ASC + subscribedAt DESC
            .limit(1)
            .get();

        if (snap.empty) {
            return res.status(404).json({
                success: false,
                error: 'Aucun abonnement actif trouvé. Activez d\'abord un abonnement.',
            });
        }

        const doc = snap.docs[0];
        if (!doc) {
            return res.status(404).json({
                success: false,
                error: 'Aucun abonnement trouvé',
            });
        }
        const currentData = doc.data();
        const currentPlan = currentData.plan as PlanKey;

        if (currentPlan === newPlan) {
            return res.status(400).json({
                success: false,
                error: 'Vous êtes déjà sur ce plan',
            });
        }

        const previousPlans = [
            ...(currentData.previousPlans ?? []),
            currentPlan,
        ];

        await doc.ref.update({
            plan: newPlan,
            interval: PLANS[newPlan as PlanKey].interval,
            amount: PLANS[newPlan as PlanKey].amount,
            previousPlans,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({
            success: true,
            message: `Plan changé vers ${PLANS[newPlan as PlanKey].label}. Effectif à la prochaine période.`,
            data: {
                subscriptionId: doc.id,
                previousPlan: currentPlan,
                newPlan,
                effectiveFrom: currentData.currentPeriodEnd,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/subscriptions/cancel — ANNULER L'ABONNEMENT
//
// Body: { immediately?: boolean, reason?: string }
//
// immediately = false (défaut) → cancelAtPeriodEnd = true
//   L'utilisateur garde l'accès jusqu'à currentPeriodEnd
// immediately = true → status = 'canceled' immédiatement
// ─────────────────────────────────────────────────────────────
export const cancelSubscription = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { immediately = false, reason } = req.body;

    try {
        const snap = await db
            .collection('subscriptions')
            .where('userId', '==', uid)
            .where('status', 'in', ['active', 'trialing'])
            .orderBy('subscribedAt', 'desc') // Index Firestore requis : userId ASC + subscribedAt DESC
            .limit(1)
            .get();

        if (snap.empty) {
            return res.status(404).json({
                success: false,
                error: 'Aucun abonnement actif à annuler',
            });
        }

        const doc = snap.docs[0];
        if (!doc) {
            return res.status(404).json({
                success: false,
                error: 'Aucun abonnement trouvé',
            });
        }
        const now = new Date();

        const updates: Record<string, any> = {
            canceledAt: admin.firestore.FieldValue.serverTimestamp(),
            cancelReason: reason ?? null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        let message: string;

        if (immediately) {
            updates.status = 'canceled';
            updates.cancelAtPeriodEnd = false;
            message = 'Abonnement annulé immédiatement. Votre accès a été révoqué.';
        } else {
            updates.cancelAtPeriodEnd = true;
            message = `Abonnement annulé. Votre accès reste actif jusqu'au ${doc.data().currentPeriodEnd?.toDate().toLocaleDateString('fr-FR')}.`;
        }

        await db.runTransaction(async (transaction) => {
            transaction.update(doc.ref, updates);

            // Notification d'annulation
            const notifRef = db.collection('notifications').doc();
            transaction.set(notifRef, {
                id: notifRef.id,
                type: 'subscription_canceled',
                recipientUid: uid,
                immediately,
                periodEnd: doc.data().currentPeriodEnd ?? null,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });

        return res.json({
            success: true,
            message,
            data: {
                subscriptionId: doc.id,
                cancelAtPeriodEnd: !immediately,
                canceledAt: now.toISOString(),
                accessUntil: immediately ? null : doc.data().currentPeriodEnd?.toDate().toISOString(),
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/subscriptions/reactivate — RÉACTIVER
//
// Annule un cancelAtPeriodEnd = true avant expiration
// ─────────────────────────────────────────────────────────────
export const reactivateSubscription = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    try {
        const snap = await db
            .collection('subscriptions')
            .where('userId', '==', uid)
            .where('status', '==', 'active')
            .where('cancelAtPeriodEnd', '==', true)
            .limit(1)
            .get();

        if (snap.empty) {
            return res.status(404).json({
                success: false,
                error: 'Aucun abonnement en cours d\'annulation à réactiver',
            });
        }

        const doc = snap.docs[0];
        if (!doc) {
            return res.status(404).json({
                success: false,
                error: 'Aucun abonnement trouvé',
            });
        }

        await doc.ref.update({
            cancelAtPeriodEnd: false,
            canceledAt: null,
            cancelReason: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({
            success: true,
            message: 'Abonnement réactivé avec succès. Il sera renouvelé automatiquement.',
            data: {
                subscriptionId: doc.id,
                nextRenewal: doc.data().currentPeriodEnd,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/subscriptions/check-access — VÉRIFIER L'ACCÈS
//
// Middleware-like : retourne { hasAccess, reason }
// Utilisé par le client avant d'afficher des fonctions premium
// ─────────────────────────────────────────────────────────────
export const checkAccess = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    try {
        const snap = await db
            .collection('subscriptions')
            .where('userId', '==', uid)
            .orderBy('subscribedAt', 'desc')
            .limit(1)
            .get();

        const [doc] = snap.docs;

        if (!doc) {
            return res.json({
                success: true,
                data: { hasAccess: false, reason: 'no_subscription' },
            });
        }

        const sub = doc.data() as any;
        const now = new Date();

        // Trialing : vérifier expiresAt
        if (sub.status === 'trialing') {
            const trialEnd: Date = sub.expiresAt?.toDate();
            if (trialEnd && trialEnd > now) {
                const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000);
                return res.json({
                    success: true,
                    data: {
                        hasAccess: true,
                        reason: 'trialing',
                        daysRemaining: daysLeft,
                        trialEndsAt: trialEnd.toISOString(),
                    },
                });
            }
            return res.json({
                success: true,
                data: { hasAccess: false, reason: 'trial_expired' },
            });
        }

        // Actif
        if (sub.status === 'active') {
            const periodEnd: Date = sub.currentPeriodEnd?.toDate();

            if (sub.cancelAtPeriodEnd && periodEnd && periodEnd < now) {
                return res.json({
                    success: true,
                    data: { hasAccess: false, reason: 'canceled_expired' },
                });
            }

            return res.json({
                success: true,
                data: {
                    hasAccess: true,
                    reason: sub.cancelAtPeriodEnd ? 'active_canceling' : 'active',
                    plan: sub.plan,
                    periodEndsAt: periodEnd?.toISOString() ?? null,
                    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                },
            });
        }

        return res.json({
            success: true,
            data: { hasAccess: false, reason: sub.status },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/subscriptions/history — HISTORIQUE
// ─────────────────────────────────────────────────────────────
export const getSubscriptionHistory = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;

    try {
        const snap = await db
            .collection('subscriptions')
            .where('userId', '==', uid)
            .orderBy('subscribedAt', 'desc') // Index Firestore requis : userId ASC + subscribedAt DESC
            .get();

        const history = snap.docs.map((doc) => {
            const d = doc.data();
            return {
                id: doc.id,
                plan: d.plan,
                status: d.status,
                amount: d.amount,
                currency: d.currency,
                interval: d.interval,
                transactionId: d.transactionId ?? null,
                currentPeriodStart: d.currentPeriodStart ?? null,
                currentPeriodEnd: d.currentPeriodEnd ?? null,
                cancelAtPeriodEnd: d.cancelAtPeriodEnd,
                canceledAt: d.canceledAt ?? null,
                subscribedAt: d.subscribedAt ?? null,
            };
        });

        return res.json({
            success: true,
            data: history,
            count: history.length,
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/subscriptions/expire-trial — WEBHOOK INTERNE
//
// À appeler par un Cloud Scheduler (cron quotidien) pour passer
// les trials expirés en 'expired' et envoyer une notif.
// Protégé par un secret interne (X-Cron-Secret header).
// ─────────────────────────────────────────────────────────────
export const expireTrials = async (req: Request, res: Response) => {
    const secret = req.headers['x-cron-secret'];

    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
        return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    try {
        const now = admin.firestore.Timestamp.now();

        const snap = await db
            .collection('subscriptions')
            .where('status', '==', 'trialing')
            .where('expiresAt', '<=', now)
            .get();

        if (snap.empty) {
            return res.json({ success: true, message: 'Aucune trial expirée', processed: 0 });
        }

        const batch = db.batch();
        let count = 0;

        for (const doc of snap.docs) {
            batch.update(doc.ref, {
                status: 'expired',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Notification push-like pour rappeler de s'abonner
            const notifRef = db.collection('notifications').doc();
            batch.set(notifRef, {
                id: notifRef.id,
                type: 'trial_expired',
                recipientUid: doc.data().userId,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            count++;
        }

        await batch.commit();

        return res.json({
            success: true,
            message: `${count} trial(s) passée(s) en 'expired'`,
            processed: count,
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/subscriptions/apply-referral — APPLIQUER PARRAINAGE
//
// Body: { referralCode }
// Crédite 15 jours gratuits si le code est valide et non encore utilisé
// ─────────────────────────────────────────────────────────────
export const applyReferral = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const { referralCode } = req.body;

    if (!referralCode || typeof referralCode !== 'string') {
        return res.status(400).json({ success: false, error: 'referralCode requis' });
    }


    try {
        // 1. Trouver le parrain
        const referrerSnap = await db
            .collection('users')
            .where('referralCode', '==', referralCode.toUpperCase().trim())
            .limit(1)
            .get();

        if (referrerSnap.empty) {
            return res.status(404).json({ success: false, error: 'Code de parrainage invalide' });
        }

        const referrerDoc = referrerSnap.docs[0];

        if (!referrerDoc) {
            return res.status(400).json({ success: false, error: 'Code de parrainage invalide' });
        }
        if (referrerDoc.id === uid) {
            return res.status(400).json({
                success: false,
                error: 'Vous ne pouvez pas utiliser votre propre code de parrainage',
            });
        }

        // Vérifier que le parrain n'a pas déjà atteint 5 filleuls inscrits
        const referrerData = referrerDoc.data() as any;
        const currentReferralCount: number = referrerData?.referralCount ?? 0;

        if (currentReferralCount >= REFERRAL_CONFIG.maxReferrals) {
            return res.status(400).json({
                success: false,
                error: 'Ce code de parrainage a atteint sa limite d\'utilisation',
            });
        }

        // 2. Vérifier que l'utilisateur n'a pas déjà utilisé un code
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() as any;

        if (userData.referredBy) {
            return res.status(400).json({
                success: false,
                error: 'Vous avez déjà utilisé un code de parrainage',
            });
        }

        // 3. Récupérer l'abonnement actuel
        const subSnap = await db
            .collection('subscriptions')
            .where('userId', '==', uid)
            .orderBy('subscribedAt', 'desc') // Index Firestore requis : userId ASC + subscribedAt DESC
            .limit(1)
            .get();

        if (subSnap.empty) {
            return res.status(404).json({ success: false, error: 'Aucun abonnement trouvé' });
        }

        const subDoc = subSnap.docs[0];
        if (!subDoc) {
            return res.status(404).json({
                success: false,
                error: 'Aucun abonnement trouvé',
            });
        }
        const subData = subDoc.data() as any;

        // 4. Étendre la trial de 30 jours (ou créditer un mois si actif)
        const now = new Date();
        const baseDate = subData.expiresAt?.toDate() ?? subData.currentPeriodEnd?.toDate() ?? now;
        const extended = new Date(baseDate);
        extended.setDate(extended.getDate() + 15);

        await db.runTransaction(async (transaction) => {
            // Étendre l'abonnement
            if (subData.status === 'trialing') {
                transaction.update(subDoc.ref, {
                    expiresAt: admin.firestore.Timestamp.fromDate(extended),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    currentPeriodEnd: admin.firestore.Timestamp.fromDate(extended)
                });
            } else if (subData.status === 'active') {
                const newEnd = computePeriodEnd(subData.currentPeriodEnd.toDate(), subData.plan);
                transaction.update(subDoc.ref, {
                    currentPeriodEnd: admin.firestore.Timestamp.fromDate(newEnd),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }

            // Marquer l'utilisateur comme parrainé
            transaction.update(db.collection('users').doc(uid), {
                referredBy: referrerDoc.id,
                referredByCode: referralCode.toUpperCase().trim(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Incrémenter le compteur de filleuls du parrain
            transaction.update(referrerDoc.ref, {
                referralCount: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Notifier le parrain
            const notifRef = db.collection('notifications').doc();
            transaction.set(notifRef, {
                id: notifRef.id,
                type: 'referral_used',
                recipientUid: referrerDoc.id,
                referredUid: uid,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });

        return res.json({
            success: true,
            message: '15 jours offerts grâce au parrainage !',
            data: {
                extensionDays: 15,
                newExpiryDate: extended.toISOString(),
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/subscriptions/simulate — SIMULATION (DEV ONLY)
// ─────────────────────────────────────────────────────────────
export const simulateSubscription = async (req: Request, res: Response) => {

    // Bloquer en production
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            success: false,
            error: 'Non disponible en production',
        });
    }

    const uid = (req as any).user.uid;
    const { plan = 'monthly' } = req.body;

    if (!PLANS[plan as PlanKey]) {
        return res.status(400).json({
            success: false,
            error: `plan invalide — valeurs acceptées : ${Object.keys(PLANS).join(' | ')}`,
        });
    }

    try {
        const selectedPlan = plan as PlanKey;
        const planConfig = PLANS[selectedPlan];
        const now = new Date();
        const periodEnd = computePeriodEnd(now, selectedPlan);

        // Récupérer l'abonnement courant (même logique qu'activateSubscription)
        const currentSnap = await db
            .collection('subscriptions')
            .where('userId', '==', uid)
            .orderBy('subscribedAt', 'desc')
            .limit(1)
            .get();

        let subscriptionDocId: string;
        let previousPlans: string[] = [];

        if (currentSnap.empty) {
            subscriptionDocId = db.collection('subscriptions').doc().id;
        } else {
            const currentDoc = currentSnap.docs[0]!;
            subscriptionDocId = currentDoc.id;
            const currentData = currentDoc.data();
            previousPlans = currentData.previousPlans ?? [];
            if (currentData.plan && currentData.plan !== selectedPlan) {
                previousPlans = [...previousPlans, currentData.plan];
            }
        }

        const subRef = db.collection('subscriptions').doc(subscriptionDocId);

        await db.runTransaction(async (transaction) => {
            transaction.set(subRef, {
                id: subscriptionDocId,
                userId: uid,
                plan: selectedPlan,
                status: 'active',
                amount: planConfig.amount,
                currency: 'XOF',
                interval: planConfig.interval,
                currentPeriodStart: admin.firestore.Timestamp.fromDate(now),
                currentPeriodEnd: admin.firestore.Timestamp.fromDate(periodEnd),
                cancelAtPeriodEnd: false,
                paymentMethod: 'simulation',                      // ← marqué simulation
                transactionId: `SIM-${uid.slice(0, 6)}-${Date.now()}`,
                receiptUrl: null,
                subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
                canceledAt: null,
                expiresAt: null,
                previousPlans,
                activatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: false });

            // Notification (même structure qu'un vrai abonnement)
            const notifRef = db.collection('notifications').doc();
            transaction.set(notifRef, {
                id: notifRef.id,
                type: 'subscription_activated',
                recipientUid: uid,
                plan: selectedPlan,
                amount: planConfig.amount,
                periodEnd: admin.firestore.Timestamp.fromDate(periodEnd),
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });

        return res.status(200).json({
            success: true,
            message: `[SIMULATION] Abonnement ${planConfig.label} activé`,
            data: {
                subscriptionId: subscriptionDocId,
                plan: selectedPlan,
                status: 'active',
                currentPeriodEnd: periodEnd.toISOString(),
                amount: planConfig.amount,
                currency: 'XOF',
                isSimulation: true,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// UTILITAIRE INTERNE — Récompenser le parrain
// Déclenché automatiquement depuis activateSubscription
// ─────────────────────────────────────────────────────────────
const rewardReferrer = async (
    uid: string,
    transaction: admin.firestore.Transaction
): Promise<void> => {

    // 1. Récupérer l'utilisateur filleul
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data() as any;

    // Pas de parrain ou récompense déjà créditée → stop (idempotence)
    if (!userData?.referredBy) return;
    if (userData?.referralRewardClaimed === true) return;

    const referrerId: string = userData.referredBy;

    // 2. Vérifier que le parrain n'a pas atteint la limite de 5 filleuls récompensés
    const referrerDoc = await db.collection('users').doc(referrerId).get();
    const referrerData = referrerDoc.data() as any;

    const rewardedCount: number = referrerData?.referralRewardedCount ?? 0;
    if (rewardedCount >= REFERRAL_CONFIG.maxReferrals) {
        // Limite atteinte : on marque quand même le filleul pour éviter de retester
        transaction.update(db.collection('users').doc(uid), {
            referralRewardClaimed: true,
            referralRewardSkipped: true, // limite parrain atteinte
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
    }

    // 3. Récupérer l'abonnement actif du parrain
    const referrerSubSnap = await db
        .collection('subscriptions')
        .where('userId', '==', referrerId)
        .where('status', 'in', ['active', 'trialing'])
        .orderBy('subscribedAt', 'desc')
        .limit(1)
        .get();

    const referrerSubDoc = referrerSubSnap.docs[0];
    const rewardDays = REFERRAL_CONFIG.referrerRewardDays;

    if (referrerSubDoc) {
        const refSub = referrerSubDoc.data() as any;

        if (refSub.status === 'trialing' && refSub.expiresAt) {
            // Étendre la trial du parrain
            const newExpiry = new Date(refSub.expiresAt.toDate());
            newExpiry.setDate(newExpiry.getDate() + rewardDays);
            transaction.update(referrerSubDoc.ref, {
                expiresAt: admin.firestore.Timestamp.fromDate(newExpiry),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

        } else if (refSub.status === 'active' && refSub.currentPeriodEnd) {
            // Étendre la période active du parrain
            const newEnd = new Date(refSub.currentPeriodEnd.toDate());
            newEnd.setDate(newEnd.getDate() + rewardDays);
            transaction.update(referrerSubDoc.ref, {
                currentPeriodEnd: admin.firestore.Timestamp.fromDate(newEnd),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
    }

    // 4. Mettre à jour les compteurs du parrain
    transaction.update(db.collection('users').doc(referrerId), {
        referralRewardedCount: admin.firestore.FieldValue.increment(1),
        totalReferralDaysEarned: admin.firestore.FieldValue.increment(rewardDays),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 5. Marquer le filleul comme récompensé (idempotence stricte)
    transaction.update(db.collection('users').doc(uid), {
        referralRewardClaimed: true,
        referralRewardClaimedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 6. Notification au parrain
    const notifRef = db.collection('notifications').doc();
    transaction.set(notifRef, {
        id: notifRef.id,
        type: 'referral_reward_credited',
        recipientUid: referrerId,
        referredUid: uid,
        rewardDays,
        remainingSlots: REFERRAL_CONFIG.maxReferrals - (rewardedCount + 1),
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
};