import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { NotificationService } from './notification.service';
import { environment } from 'src/environments/environment';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {

    constructor(
        private platform: Platform,
        private notifService: NotificationService,
        private messaging: Messaging
    ) { }

    async initialize(): Promise<void> {
        if (this.platform.is('capacitor')) {
            await this.initNative();
        } else {
            await this.initWeb();
        }
    }

    private async initNative(): Promise<void> {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const permission = await PushNotifications.requestPermissions();
        if (permission.receive !== 'granted') return;

        await PushNotifications.register();

        PushNotifications.addListener('registration', (token: { value: string }) => {
            console.log('[FCM Native] Token:', token.value);
            this.registerTokenSafely(token.value);
        });

        PushNotifications.addListener('registrationError', (err: any) => {
            console.error('[FCM Native] Erreur:', err);
        });

        PushNotifications.addListener('pushNotificationReceived', () => {
            this.notifService.refreshUnreadCount();
        });

        PushNotifications.addListener('pushNotificationActionPerformed', () => {
            this.notifService.refreshUnreadCount();
        });
    }

    private async initWeb(): Promise<void> {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            console.warn('[FCM Web] Non supporté');
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[FCM Web] Permission refusée');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.register(
                '/firebase-messaging-sw.js', { scope: '/' }
            );

            const token = await getToken(this.messaging, {
                vapidKey: environment.firebase.vapidKey,
                serviceWorkerRegistration: registration,
            });

            if (token) {
                this.registerTokenSafely(token);
            }

            onMessage(this.messaging, (payload) => {
                console.log('[FCM Web] Message foreground:', payload);
                this.notifService.refreshUnreadCount();
                new Notification(payload.notification?.title ?? 'Tontine Plus', {
                    body: payload.notification?.body ?? '',
                    icon: '/assets/icon/favicon.png'
                });
            });

        } catch (err: any) {
            console.error('[FCM Web] Erreur:', err);
        }
    }

    private registerTokenSafely(token: string): void {
        this.notifService.registerFcmToken(token).subscribe({
            next: () => {},
            error: (err: any) => console.error('[FCM] Erreur enregistrement token:', err),
        });
    }

    async unregister(): Promise<void> {
        if (this.platform.is('capacitor')) {
            const { PushNotifications } = await import('@capacitor/push-notifications');
            await PushNotifications.removeAllListeners();
        }
    }
}