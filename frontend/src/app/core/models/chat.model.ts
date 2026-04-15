export type MessageType = 'text' | 'vote' | 'system';
export type VoteStatus = 'open' | 'closed';

// ─── Option d'un vote ────────────────────────────────────────────────────────
export interface VoteOption {
    id: string;      // 'opt_0', 'opt_1'...
    label: string;
}

// ─── Données d'un vote intégré dans un message ───────────────────────────────
export interface VoteData {
    question: string;
    options: VoteOption[];
    votes: Record<string, string>;   // { uid: optionId }
    status: VoteStatus;
    expiresAt: any | null;           // Firestore Timestamp
    createdBy: string;
}

// ─── Message Firestore ────────────────────────────────────────────────────────
export interface ChatMessage {
    id: string;
    tontineId: string;
    type: MessageType;

    senderId: string;
    senderName: string | null;
    senderPhotoUrl: string | null;
    senderRole: 'creator' | 'admin' | 'member';

    text: string | null;

    readBy: string[];
    reactions: Record<string, string[]>;  // { emoji: uid[] }

    replyTo: {
        messageId: string;
        senderName: string;
        preview: string;
    } | null;

    editedAt: any | null;
    deletedAt: any | null;

    // Uniquement si type === 'vote'
    vote: VoteData | null;

    createdAt: any;   // Firestore Timestamp
}

// ─── Preview conversation (liste des chats) ───────────────────────────────────
export interface ConversationPreview {
    tontineId: string;
    tontineName: string;
    tontineIcon: string | null;
    tontineStatus: string;
    membersCount: number;
    lastMessage: string | null;
    lastMessageAt: any | null;
    lastMessageSender: string | null;
    unreadCount: number;
}

// ─── Payloads API ─────────────────────────────────────────────────────────────

export interface SendMessagePayload {
    text: string;
}

export interface CreateVotePayload {
    question: string;
    options: string[];
    expiresInHours?: number;
}

export interface CastVotePayload {
    optionId: string;
}

export interface ReactPayload {
    emoji: '👍' | '❤️' | '😂' | '😮' | '🙏' | '🔥';
}

// ─── Réponses API ─────────────────────────────────────────────────────────────

export interface MessagesResponse {
    success: boolean;
    data: ChatMessage[];
    count: number;
    hasMore: boolean;
    nextCursor: string | null;
}

export interface ConversationsResponse {
    success: boolean;
    data: ConversationPreview[];
    count: number;
}

export interface VoteResults {
    results: Record<string, number>;  // { optionId: count }
    totalVotes: number;
    yourVote: string;
}