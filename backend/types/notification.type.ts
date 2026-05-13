// ─────────────────────────────────────────────────────────────
// TYPES — Notifications
// ─────────────────────────────────────────────────────────────

export type NotificationType =
    | 'welcome'  
    | 'cotisation_reminder'     // Rappel de cotisation à venir
    | 'cotisation_paid'         // Cotisation payée avec succès
    | 'cotisation_late'         // Cotisation en retard
    | 'turn_received'           // C'est votre tour ce mois-ci
    | 'member_to_validate'      // Nouveau membre à valider
    | 'member_joined'           // Nouveau membre a rejoint
    | 'member_excluded'         // Membre exclu
    | 'tontine_started'         // Tontine démarrée
    | 'tontine_ended'           // Tontine terminée
    | 'tontine_completed'           // Tontine terminée
    | 'payout_sent'             // Paiement envoyé
    | 'vote_opened'             // Vote ouvert
    | 'vote_closed'             // Vote clôturé
    | 'join_request'
    | 'join_accepted'
    | 'join_rejected'
    | 'vote_open'
    | 'vote_next_turn'
    | 'payment_confirmed'
    | 'payment_failed'
    | 'distribution_sent_to_you'
    | 'distribution_sent'
    | 'distribution_received'
    | 'next_beneficiary'
    | 'collection_complete'
    | 'system';                 // Message système

export interface NotificationPayload {
    title: string;
    body: string;
    type: NotificationType;
    tontineId?: string;
    tontineName?: string;
    amount?: number;
    currency?: string;
    date?: string;              // ISO string
    memberId?: string;
    memberName?: string;
    [key: string]: any;         // champs supplémentaires flexibles
}

export interface StoredNotification {
    id: string;
    userId: string;
    title: string;
    body: string;
    type: NotificationType;
    isRead: boolean;
    data: Record<string, any>;
    createdAt: FirebaseFirestore.Timestamp;
    readAt: FirebaseFirestore.Timestamp | null;
    deletedAt: FirebaseFirestore.Timestamp | null;
}