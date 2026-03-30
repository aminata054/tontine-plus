import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
    AppNotification,
    NotificationsResponse,
    UnreadCountResponse,
} from '../models/notification.model';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
    private readonly API = environment.apiUrl + '/notifications';

    private unreadCount$ = new BehaviorSubject<number>(0);
    unreadCount = this.unreadCount$.asObservable();

    constructor(private http: HttpClient, private storage: StorageService) { }

    
    // ── Liste paginée ──────────────────────────────────────────
    getNotifications(
        page = 1,
        limit = 20,
        unreadOnly = false
    ): Observable<NotificationsResponse> {
        return this.http
            .get<NotificationsResponse>(this.API, {
                params: { page, limit, unreadOnly },
            })
            .pipe(
                tap((res) => {
                    if (res.success) this.unreadCount$.next(res.meta.unreadCount);
                })
            );
    }

    // ── Badge ──────────────────────────────────────────────────
    refreshUnreadCount(): void {
        this.http
            .get<UnreadCountResponse>(`${this.API}/unread-count`)
            .subscribe((res) => {
                if (res.success) this.unreadCount$.next(res.data.unreadCount);
            });
    }

    // ── Marquer une notif lue ──────────────────────────────────
    markAsRead(id: string): Observable<any> {
        return this.http.patch(`${this.API}/${id}/read`, {});
    }

    // ── Tout marquer lu ────────────────────────────────────────
    markAllAsRead(): Observable<any> {
        return this.http
            .patch(`${this.API}/read-all`, {})
            .pipe(tap(() => this.unreadCount$.next(0)));
    }

    // ── Supprimer une notif ────────────────────────────────────
    deleteNotification(id: string): Observable<any> {
        return this.http.delete(`${this.API}/${id}`);
    }

    // ── Supprimer toutes ───────────────────────────────────────
    deleteAll(): Observable<any> {
        return this.http.delete(this.API);
    }

    // ── Enregistrer token FCM ──────────────────────────────────
    registerFcmToken(token: string): Observable<any> {
        return this.http.post(`${this.API}/token`, { token });
    }

    removeFcmToken(token: string): Observable<any> {
        return this.http.delete(`${this.API}/token`, { body: { token } });
    }

    // ── Helpers ────────────────────────────────────────────────
    decrementUnread(): void {
        const current = this.unreadCount$.value;
        if (current > 0) this.unreadCount$.next(current - 1);
    }
}