import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { tap, takeUntil } from 'rxjs/operators';
import {
    Firestore,
    collection,
    query,
    orderBy,
    limit,
    onSnapshot,
    Unsubscribe,
    where,
} from '@angular/fire/firestore';
import { environment } from 'src/environments/environment';
import {
    ChatMessage,
    ConversationPreview,
    ConversationsResponse,
    MessagesResponse,
    SendMessagePayload,
    CreateVotePayload,
    CastVotePayload,
    ReactPayload,
    VoteResults,
} from '../models/chat.model';

@Injectable({ providedIn: 'root' })
export class ChatService implements OnDestroy {

    private readonly API = environment.apiUrl;
    private destroy$ = new Subject<void>();

    // ── Cache messages par tontineId ─────────────────────────────────────────
    private messagesMap = new Map<string, BehaviorSubject<ChatMessage[]>>();

    // ── Cache conversations (liste globale) ──────────────────────────────────
    private conversationsSubject = new BehaviorSubject<ConversationPreview[]>([]);
    public conversations$ = this.conversationsSubject.asObservable();

    // ── Listeners Firestore actifs ───────────────────────────────────────────
    private listeners = new Map<string, Unsubscribe>();

    constructor(
        private http: HttpClient,
        private firestore: Firestore,
    ) { }

    // ─────────────────────────────────────────────────────────────
    // TEMPS RÉEL — onSnapshot Firestore
    // S'abonner aux messages d'une tontine en temps réel
    // Retourne un Observable<ChatMessage[]> qui se met à jour automatiquement
    // ─────────────────────────────────────────────────────────────
    subscribeToMessages(tontineId: string): Observable<ChatMessage[]> {
        // Créer le BehaviorSubject s'il n'existe pas
        if (!this.messagesMap.has(tontineId)) {
            this.messagesMap.set(tontineId, new BehaviorSubject<ChatMessage[]>([]));
        }

        const subject = this.messagesMap.get(tontineId)!;

        // Ne pas créer un double listener
        if (!this.listeners.has(tontineId)) {
            const chatRef = collection(
                this.firestore,
                `tontines/${tontineId}/chat`
            );

            const q = query(
                chatRef,
                where('deletedAt', '==', null),
                orderBy('createdAt', 'asc'),
                limit(100)
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const messages: ChatMessage[] = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                } as ChatMessage));

                subject.next(messages);
            }, (error) => {
                console.error(`[ChatService] Erreur onSnapshot tontine ${tontineId}:`, error);
            });

            this.listeners.set(tontineId, unsubscribe);
        }

        return subject.asObservable();
    }

    // Arrêter le listener d'une tontine (quand on quitte la page)
    unsubscribeFromMessages(tontineId: string): void {
        const unsub = this.listeners.get(tontineId);
        if (unsub) {
            unsub();
            this.listeners.delete(tontineId);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // HTTP — Envoyer un message
    // ─────────────────────────────────────────────────────────────
    sendMessage(tontineId: string, text: string): Observable<{ success: boolean; data: { messageId: string } }> {
        const payload: SendMessagePayload = { text };
        return this.http.post<any>(`${this.API}/tontines/${tontineId}/chat`, payload);
    }

    // ─────────────────────────────────────────────────────────────
    // HTTP — Charger les messages (initial + pagination)
    // Pour le premier chargement avant que onSnapshot soit prêt
    // ─────────────────────────────────────────────────────────────
    getMessages(tontineId: string, limitCount = 30, before?: string): Observable<MessagesResponse> {
        let url = `${this.API}/tontines/${tontineId}/chat?limit=${limitCount}`;
        if (before) url += `&before=${before}`;
        return this.http.get<MessagesResponse>(url);
    }

    // ─────────────────────────────────────────────────────────────
    // HTTP — Supprimer un message
    // ─────────────────────────────────────────────────────────────
    deleteMessage(tontineId: string, messageId: string): Observable<{ success: boolean }> {
        return this.http.delete<any>(`${this.API}/tontines/${tontineId}/chat/${messageId}`);
    }

    // ─────────────────────────────────────────────────────────────
    // HTTP — Réagir à un message
    // ─────────────────────────────────────────────────────────────
    reactToMessage(tontineId: string, messageId: string, emoji: ReactPayload['emoji']): Observable<any> {
        return this.http.post<any>(
            `${this.API}/tontines/${tontineId}/chat/${messageId}/react`,
            { emoji }
        );
    }

    // ─────────────────────────────────────────────────────────────
    // HTTP — Créer un vote
    // ─────────────────────────────────────────────────────────────
    createVote(tontineId: string, payload: CreateVotePayload): Observable<any> {
        return this.http.post<any>(
            `${this.API}/tontines/${tontineId}/chat/vote`,
            payload
        );
    }

    // ─────────────────────────────────────────────────────────────
    // HTTP — Voter
    // ─────────────────────────────────────────────────────────────
    castVote(tontineId: string, messageId: string, optionId: string): Observable<VoteResults> {
        return this.http.post<VoteResults>(
            `${this.API}/tontines/${tontineId}/chat/${messageId}/vote/cast`,
            { optionId } as CastVotePayload
        );
    }

    // ─────────────────────────────────────────────────────────────
    // HTTP — Clôturer un vote
    // ─────────────────────────────────────────────────────────────
    closeVote(tontineId: string, messageId: string): Observable<any> {
        return this.http.patch<any>(
            `${this.API}/tontines/${tontineId}/chat/${messageId}/vote/close`,
            {}
        );
    }

    // ─────────────────────────────────────────────────────────────
    // HTTP — Marquer comme lu
    // ─────────────────────────────────────────────────────────────
    markAsRead(tontineId: string, messageId: string): Observable<any> {
        return this.http.patch<any>(
            `${this.API}/tontines/${tontineId}/chat/${messageId}/read`,
            {}
        );
    }

    // ─────────────────────────────────────────────────────────────
    // HTTP — Liste des conversations
    // ─────────────────────────────────────────────────────────────
    getMyConversations(): Observable<ConversationsResponse> {
        return this.http.get<ConversationsResponse>(`${this.API}/chat/conversations`).pipe(
            tap(res => {
                if (res.success) this.conversationsSubject.next(res.data);
            })
        );
    }

    // ─────────────────────────────────────────────────────────────
    // UTILITAIRES
    // ─────────────────────────────────────────────────────────────

    /** Formater l'heure d'un message */
    formatMessageTime(timestamp: any): string {
        if (!timestamp) return '';
        const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        if (isToday) {
            return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return 'Hier ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }

        return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    }

    /** Calculer les résultats d'un vote en % */
    getVotePercentages(votes: Record<string, string>, options: { id: string; label: string }[]): { id: string; label: string; count: number; percent: number }[] {
        const total = Object.keys(votes).length;
        return options.map(opt => {
            const count = Object.values(votes).filter(v => v === opt.id).length;
            return {
                ...opt,
                count,
                percent: total > 0 ? Math.round((count / total) * 100) : 0,
            };
        });
    }

    /** Générer les initiales d'un nom */
    getInitials(name: string | null): string {
        if (!name) return '?';
        return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    }

    // ─────────────────────────────────────────────────────────────
    // NETTOYAGE
    // ─────────────────────────────────────────────────────────────
    clearCache(tontineId?: string): void {
        if (tontineId) {
            this.unsubscribeFromMessages(tontineId);
            this.messagesMap.delete(tontineId);
        } else {
            this.listeners.forEach(unsub => unsub());
            this.listeners.clear();
            this.messagesMap.clear();
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.clearCache();
    }
}