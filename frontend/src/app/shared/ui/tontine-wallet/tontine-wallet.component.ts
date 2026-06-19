// src/app/shared/ui/tontine-wallet/tontine-wallet.component.ts
import {
  Component, Input, OnInit, OnDestroy, OnChanges,
  SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSkeletonText } from '@ionic/angular/standalone';
import { Subject, interval } from 'rxjs';
import { takeUntil, switchMap, startWith } from 'rxjs/operators';
import { WalletService, TontineWalletData } from 'src/app/core/services/wallet.service';

@Component({
  selector: 'app-tontine-wallet',
  templateUrl: './tontine-wallet.component.html',
  styleUrls: ['./tontine-wallet.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon, IonSkeletonText],
})
export class TontineWalletComponent implements OnInit, OnDestroy, OnChanges {
  @Input() tontineId!: string;
  @Input() currentUserId: string | null = null;

  wallet: TontineWalletData | null = null;
  loading = true;
  expanded = false;

  // Pour l'animation de remplissage progressive
  animatedFillRate = 0;
  private targetFillRate = 0;
  private animFrameId?: any;

  private destroy$ = new Subject<void>();
  // Polling toutes les 10s pour voir les paiements des autres membres en temps réel
  private readonly POLL_INTERVAL_MS = 10_000;

  constructor(
    private walletService: WalletService,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.startPolling();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tontineId'] && !changes['tontineId'].firstChange) {
      this.wallet = null;
      this.loading = true;
      this.animatedFillRate = 0;
      this.destroy$.next();
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }

  private startPolling(): void {
    interval(this.POLL_INTERVAL_MS)
      .pipe(
        startWith(0),
        takeUntil(this.destroy$),
        switchMap(() => this.walletService.getWallet(this.tontineId))
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            const prevStatus = this.wallet?.status;
            this.wallet = res.data;
            this.loading = false;

            // Animer la barre si le taux a changé
            if (this.targetFillRate !== res.data.fillRate) {
              this.targetFillRate = res.data.fillRate;
              this.animateFill();
            }

            // Si le statut passe à 'distributed', déclencher l'animation de vidage
            if (prevStatus !== 'distributed' && res.data.status === 'distributed') {
              this.triggerEmptyAnimation();
            }

            this.cdr.markForCheck();
          }
        },
        error: () => {
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  // ── Animation de remplissage ────────────────────────────────────────────────
  private animateFill(): void {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    const start = this.animatedFillRate;
    const end = this.targetFillRate;
    const duration = 800; // ms
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubique
      const eased = 1 - Math.pow(1 - progress, 3);
      this.animatedFillRate = Math.round(start + (end - start) * eased);
      this.cdr.markForCheck();
      if (progress < 1) {
        this.animFrameId = requestAnimationFrame(step);
      }
    };
    this.animFrameId = requestAnimationFrame(step);
  }

  // ── Animation de vidage après distribution ──────────────────────────────────
  private triggerEmptyAnimation(): void {
    const start = this.animatedFillRate;
    const duration = 1200;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = Math.pow(progress, 2); // accélère vers la fin
      this.animatedFillRate = Math.round(start * (1 - eased));
      this.cdr.markForCheck();
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }

  // ── Helpers template ────────────────────────────────────────────────────────

  get statusLabel(): string {
    switch (this.wallet?.status) {
      case 'collecting': return 'En cours de collecte';
      case 'ready': return 'Prêt à distribuer';
      case 'distributed': return 'Distribué';
      default: return '—';
    }
  }

  get statusColor(): string {
    switch (this.wallet?.status) {
      case 'collecting': return '#3B82F6';
      case 'ready': return '#10B981';
      case 'distributed': return '#8B5CF6';
      default: return '#94A3B8';
    }
  }

  get remainingAmount(): number {
    if (!this.wallet) return 0;
    return Math.max(0, this.wallet.targetAmount - this.wallet.balance);
  }

  hasIPaid(): boolean {
    if (!this.wallet || !this.currentUserId) return false;
    return this.wallet.contributions.some(
      c => c.userId === this.currentUserId && c.turnNumber === this.wallet!.currentTurn
    );
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }

  formatAmount(v: number): string {
    return this.walletService.formatAmount(v);
  }

  formatTime(value: any): string {
    if (!value) return '—';
    const d = this.toDate(value);
    if (!d) return '—';
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value._seconds !== undefined) return new Date(value._seconds * 1000);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
}