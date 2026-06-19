import { Request, Response } from 'express';
import { db } from '../config/firebase';
import { getWallet } from '../services/wallet.service';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/wallets/:tontineId
//
// Retourne l'état du wallet de la tontine (visible par tous les membres actifs).
// ─────────────────────────────────────────────────────────────────────────────
export const getTontineWallet = async (req: Request, res: Response) => {
    const uid = (req as any).user.uid;
    const tontineId = Array.isArray(req.params.tontineId) ? req.params.tontineId[0] : req.params.tontineId;

    if (!tontineId)
        return res.status(400).json({ success: false, error: 'tontineId requis' });

    try {
        // Vérifier que l'appelant est membre actif de la tontine
        const memberDoc = await db
            .collection('tontines').doc(tontineId)
            .collection('members').doc(uid)
            .get();

        if (!memberDoc.exists || memberDoc.data()?.status !== 'active')
            return res.status(403).json({ success: false, error: 'Accès refusé' });

        const wallet = await getWallet(tontineId);

        if (!wallet) {
            // Wallet pas encore initialisé — retourner un état vide par défaut
            const tontineDoc = await db.collection('tontines').doc(tontineId).get();
            if (!tontineDoc.exists)
                return res.status(404).json({ success: false, error: 'Tontine introuvable' });

            const tontine = tontineDoc.data()!;

            // Compter les membres actifs pour calculer le targetAmount
            const membersSnap = await db
                .collection('tontines').doc(tontineId)
                .collection('members')
                .where('status', '==', 'active')
                .get();

            const targetAmount = tontine.amount * membersSnap.size;

            return res.json({
                success: true,
                data: {
                    tontineId,
                    currentTurn: tontine.currentTurn ?? 0,
                    balance: 0,
                    targetAmount,
                    status: 'collecting',
                    contributions: [],
                    lastDistributedAt: null,
                    fillRate: 0,
                    paidCount: 0,
                    totalMembers: membersSnap.size,
                },
            });
        }

        // Calculer le taux de remplissage
        const fillRate = wallet.targetAmount > 0
            ? Math.min(Math.round((wallet.balance / wallet.targetAmount) * 100), 100)
            : 0;

        // Compter les membres actifs pour les stats
        const membersSnap = await db
            .collection('tontines').doc(tontineId)
            .collection('members')
            .where('status', '==', 'active')
            .get();

        return res.json({
            success: true,
            data: {
                ...wallet,
                fillRate,
                paidCount: wallet.contributions.length,
                totalMembers: membersSnap.size,
            },
        });

    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};