import { NextFunction, Request, Response } from "express";
import { db } from "../config/firebase";

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const PREMIUM_TONTINE_TYPES = ['solidarity', 'savings_goal'] as const;
const PREMIUM_ROTATION_METHODS = ['manual', 'consensual'] as const;
const PREMIUM_SECURITY_MODELS = ['solidarity_guarantee'] as const;
const FREE_TONTINE_LIMIT = 3;

// ─────────────────────────────────────────────────────────────
// HELPER — récupérer l'abonnement actif d'un utilisateur
// ─────────────────────────────────────────────────────────────

export const getActiveSub = async (uid: string) => {
    const snap = await db
        .collection('subscriptions')
        .where('userId', '==', uid)
        .where('status', 'in', ['active', 'trialing'])
        .orderBy('subscribedAt', 'desc')
        .limit(1)
        .get();

    if (snap.empty) return null;

    const sub = snap.docs[0]?.data();
    if (!sub) return null;

    const now = new Date();

    // Trialing : vérifier expiresAt
    if (sub.status === 'trialing') {
        const trialEnd = sub.expiresAt?.toDate();
        if (!trialEnd || trialEnd < now) return null;
    }

    // Active : vérifier currentPeriodEnd
    if (sub.status === 'active') {
        const periodEnd = sub.currentPeriodEnd?.toDate();
        if (periodEnd && periodEnd < now) return null;
    }

    return sub;
};

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE — requirePremium
// Bloque si aucun abonnement actif/trialing valide
// Injecte req.subscription pour les middlewares suivants
// ─────────────────────────────────────────────────────────────

export const requirePremium = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const uid = (req as any).user.uid;
    const sub = await getActiveSub(uid);

    if (!sub) {
        res.status(403).json({
            success: false,
            error: 'Cette fonctionnalité nécessite un abonnement Premium',
            code: 'SUBSCRIPTION_REQUIRED',
        });
        return;
    }

    (req as any).subscription = sub;
    next();
};

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE — checkTontineLimit
//
// Vérifie en une seule passe :
//   1. Les champs premium (type, rotationMethod, securityModel)
//      → 403 si l'utilisateur n'est pas premium
//   2. La limite de 3 tontines actives/pending pour les gratuits
//
// Peut s'utiliser seul (sans requirePremium avant)
// ─────────────────────────────────────────────────────────────

export const checkTontineLimit = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const uid = (req as any).user.uid;
    const { type, rotationMethod, securityModel } = req.body;

    const needsPremium =
        PREMIUM_TONTINE_TYPES.includes(type) ||
        PREMIUM_ROTATION_METHODS.includes(rotationMethod) ||
        PREMIUM_SECURITY_MODELS.includes(securityModel);

    const sub = (req as any).subscription ?? (await getActiveSub(uid));

    if (needsPremium) {
        if (!sub) {
            res.status(403).json({
                success: false,
                error: 'Cette fonctionnalité nécessite un abonnement Premium',
                code: 'SUBSCRIPTION_REQUIRED',
                premiumFeatures: {
                    type: PREMIUM_TONTINE_TYPES.includes(type) ? type : null,
                    rotationMethod: PREMIUM_ROTATION_METHODS.includes(rotationMethod) ? rotationMethod : null,
                    securityModel: PREMIUM_SECURITY_MODELS.includes(securityModel) ? securityModel : null,
                },
            });
            return;
        }
        (req as any).subscription = sub;
    }

    if (!sub) {
        const countSnap = await db
            .collection('tontines')
            .where('createdBy', '==', uid)
            .where('status', 'in', ['pending', 'active'])
            .count()
            .get();

        if (countSnap.data().count >= FREE_TONTINE_LIMIT) {
            res.status(403).json({                      // ← return séparé
                success: false,
                error: `Limite de ${FREE_TONTINE_LIMIT} tontines atteinte. Passez à Premium pour en créer davantage.`,
                code: 'TONTINE_LIMIT_REACHED',
                limit: FREE_TONTINE_LIMIT,
            });
            return;                                     // ← ici
        }
    }

    next();
};

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE — requirePlan(...allowedPlans)
//
// À utiliser APRÈS requirePremium (qui injecte req.subscription)
// Ex : requirePlan('premium') ou requirePlan('annual', 'premium')
// ─────────────────────────────────────────────────────────────

export const requirePlan = (...allowedPlans: string[]) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const sub = (req as any).subscription;

        if (!sub || !allowedPlans.includes(sub.plan)) {
            res.status(403).json({
                success: false,
                error: `Cette fonctionnalité requiert un plan : ${allowedPlans.join(' ou ')}`,
                code: 'PLAN_UPGRADE_REQUIRED',
                requiredPlans: allowedPlans,
                currentPlan: sub?.plan ?? null,
            });
            return;
        }

        next();
    };
};