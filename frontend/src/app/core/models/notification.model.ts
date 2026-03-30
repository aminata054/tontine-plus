export type NotificationType =
    | 'cotisation_reminder' | 'cotisation_paid' | 'cotisation_late'
    | 'turn_received' | 'member_to_validate' | 'member_joined'
    | 'member_excluded' | 'tontine_started' | 'tontine_ended'
    | 'payout_sent' | 'vote_opened' | 'vote_closed' | 'system';

export interface AppNotification {
    id: string;
    userId: string;
    title: string;
    body: string;
    type: NotificationType;
    isRead: boolean;
    data: Record<string, any>;
    createdAt: { _seconds: number; _nanoseconds: number } | string | Date;
    readAt: any | null;
    deletedAt: any | null;
}

export interface NotificationsResponse {
    success: boolean;
    data: AppNotification[];
    meta: {
        total: number;
        unreadCount: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface UnreadCountResponse {
    success: boolean;
    data: { unreadCount: number };
}