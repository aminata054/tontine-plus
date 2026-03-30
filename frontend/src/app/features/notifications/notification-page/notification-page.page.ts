import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent, IonRefresher, IonRefresherContent,
  IonInfiniteScroll, IonInfiniteScrollContent,
  IonItemSliding, IonItem, IonItemOptions, IonItemOption,
  IonSkeletonText, IonIcon,
  ToastController, AlertController,  } from '@ionic/angular/standalone';
import { Subject, takeUntil } from 'rxjs';

import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { NotificationService } from 'src/app/core/services/notification.service';
import { AppNotification, NotificationType } from 'src/app/core/models/notification.model';
import { AuthService } from 'src/app/core/services/auth.service';

@Component({
  selector: 'app-notification-page',
  standalone: true,
  imports: [ 
    CommonModule,
    IonContent, IonRefresher, IonRefresherContent,
    IonInfiniteScroll, IonInfiniteScrollContent,
    IonItemSliding, IonItem, IonItemOptions, IonItemOption,
    IonSkeletonText, IonIcon,
    PageHeaderComponent,
  ],
  templateUrl: './notification-page.page.html',
  styleUrls: ['./notification-page.page.scss'],
})
export class NotificationPagePage implements OnInit, OnDestroy {

  notifications: AppNotification[] = [];
  isLoading = true;
  isLoadingMore = false;
  currentPage = 1;
  totalPages = 1;
  unreadCount = 0;
  activeFilter: 'all' | 'unread' = 'all';

  private destroy$ = new Subject<void>();

  constructor(
    private notifService: NotificationService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    this.notifService.unreadCount
      .pipe(takeUntil(this.destroy$))
      .subscribe(count => this.unreadCount = count);

    this.authService.isLoggedIn().then(isLogged => {   
      if (isLogged) {
        this.loadNotifications(true);
      } else {
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Chargement ─────────────────────────────────────────────
  loadNotifications(reset = false): void {
    if (reset) {
      this.currentPage = 1;
      this.isLoading = true;
    }

    const unreadOnly = this.activeFilter === 'unread';

    this.notifService
      .getNotifications(this.currentPage, 20, unreadOnly)
      .subscribe({
        next: (res) => {
          if (reset) {
            this.notifications = res.data;
          } else {
            this.notifications = [...this.notifications, ...res.data];
          }
          this.totalPages = res.meta.totalPages;
          this.isLoading = false;
          this.isLoadingMore = false;
        },
        error: () => {
          this.isLoading = false;
          this.isLoadingMore = false;
        },
      });
  }

  // ── Infinite scroll ────────────────────────────────────────
  loadMore(event: any): void {
    if (this.currentPage >= this.totalPages) {
      event.target.complete();
      return;
    }
    this.currentPage++;
    this.isLoadingMore = true;
    this.loadNotifications();
    setTimeout(() => event.target.complete(), 1000);
  }

  // ── Pull to refresh ────────────────────────────────────────
  doRefresh(event: any): void {
    this.loadNotifications(true);
    setTimeout(() => event.target.complete(), 800);
  }

  // ── Filtres ────────────────────────────────────────────────
  setFilter(filter: 'all' | 'unread'): void {
    if (this.activeFilter === filter) return;
    this.activeFilter = filter;
    this.loadNotifications(true);
  }

  // ── Marquer lu ─────────────────────────────────────────────
  markAsRead(notif: AppNotification, slidingItem?: IonItemSliding): void {
    if (notif.isRead) {
      slidingItem?.close();
      return;
    }
    notif.isRead = true; // optimistic update
    this.notifService.decrementUnread();

    this.notifService.markAsRead(notif.id).subscribe({
      error: () => {
        notif.isRead = false; // rollback
        this.notifService.refreshUnreadCount();
      },
    });
    slidingItem?.close();
  }

  // ── Supprimer ──────────────────────────────────────────────
  deleteNotif(notif: AppNotification, slidingItem?: IonItemSliding): void {
    slidingItem?.close();
    this.notifications = this.notifications.filter(n => n.id !== notif.id);
    if (!notif.isRead) this.notifService.decrementUnread();

    this.notifService.deleteNotification(notif.id).subscribe({
      error: async () => {
        this.notifications = [notif, ...this.notifications];
        const toast = await this.toastCtrl.create({
          message: 'Erreur lors de la suppression',
          duration: 2000,
          color: 'danger',
          position: 'bottom',
        });
        toast.present();
      },
    });
  }

  // ── Tout marquer lu ────────────────────────────────────────
  async markAllRead(): Promise<void> {
    if (this.unreadCount === 0) return;
    this.notifications.forEach(n => (n.isRead = true));
    this.notifService.markAllAsRead().subscribe();
  }

  // ── Tout supprimer ─────────────────────────────────────────
  async deleteAllConfirm(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Supprimer tout',
      message: 'Voulez-vous supprimer toutes vos notifications ?',
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        {
          text: 'Supprimer',
          role: 'destructive',
          handler: () => {
            this.notifications = [];
            this.notifService.deleteAll().subscribe();
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Helpers UI ─────────────────────────────────────────────
  getNotifIcon(type: NotificationType): string {
    const icons: Record<NotificationType, string> = {
      cotisation_reminder: 'time-outline',
      cotisation_paid: 'checkmark-circle-outline',
      cotisation_late: 'alert-circle-outline',
      turn_received: 'cash-outline',
      member_to_validate: 'people-outline',
      member_joined: 'people-outline',
      member_excluded: 'people-outline',
      tontine_started: 'megaphone-outline',
      tontine_ended: 'megaphone-outline',
      payout_sent: 'cash-outline',
      vote_opened: 'megaphone-outline',
      vote_closed: 'megaphone-outline',
      system: 'notifications-outline',
    };
    return icons[type] ?? 'notifications-outline';
  }

  getNotifColor(type: NotificationType): string {
    const colors: Partial<Record<NotificationType, string>> = {
      cotisation_reminder: 'warning',
      cotisation_paid: 'success',
      cotisation_late: 'danger',
      turn_received: 'success',
      member_to_validate: 'primary',
      payout_sent: 'success',
      system: 'medium',
    };
    return colors[type] ?? 'primary';
  }

  getRelativeTime(createdAt: any): string {
    let date: Date;
    if (createdAt?._seconds) {
      date = new Date(createdAt._seconds * 1000);
    } else {
      date = new Date(createdAt);
    }
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}j`;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }

  trackById(_: number, n: AppNotification): string {
    return n.id;
  }

  get todayNotifs(): AppNotification[] {
    const today = new Date();
    return this.notifications.filter(n => this.isSameDay(n.createdAt, today));
  }

  get yesterdayNotifs(): AppNotification[] {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return this.notifications.filter(n => this.isSameDay(n.createdAt, yesterday));
  }

  get olderNotifs(): AppNotification[] {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return this.notifications.filter(n => this.toDate(n.createdAt) < yesterday);
  }

  get todayUnread(): number {
    return this.todayNotifs.filter(n => !n.isRead).length;
  }

  private isSameDay(createdAt: any, ref: Date): boolean {
    const d = this.toDate(createdAt);
    return d.toDateString() === ref.toDateString();
  }

  private toDate(createdAt: any): Date {
    if (createdAt?._seconds) return new Date(createdAt._seconds * 1000);
    return new Date(createdAt);
  }
}