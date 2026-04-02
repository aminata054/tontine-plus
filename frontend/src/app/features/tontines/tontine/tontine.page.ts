import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import {
  IonContent, IonIcon, IonSkeletonText,
  IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';

import { UserProfile } from 'src/app/core/models/auth.model';
import { Tontine, Frequency, TontineStatus, TontineType } from 'src/app/core/models/tontine.model';
import { TontineService } from 'src/app/core/services/tontine.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';
import { CustomInputComponent } from 'src/app/shared/ui/custom-input/custom-input.component';

@Component({
  selector: 'app-tontine',
  templateUrl: './tontine.page.html',
  styleUrls: ['./tontine.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonIcon,
    IonSkeletonText,
    IonRefresher,
    IonRefresherContent,
    CustomButtonComponent,
    CustomInputComponent,
  ],
})
export class TontinePage implements OnInit, OnDestroy {

  user: UserProfile | null = null;
  tontines: Tontine[] = [];
  filteredTontines: Tontine[] = [];
  isLoading = true;
  hasError = false;
  searchQuery = '';

  private destroy$ = new Subject<void>();

  constructor(
    private tontineService: TontineService,
    private authService: AuthService,
    private router: Router,
  ) { }

  ngOnInit(): void {
    this.user = this.authService.currentUser;
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(u => (this.user = u));

    this.loadTontines();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Chargement ──────────────────────────────────────────────────────────────

  loadTontines(event?: any): void {
    this.hasError = false;
    if (!event) this.isLoading = true;

    this.tontineService.getMyTontines()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          if (event) event.target.complete();
        })
      )
      .subscribe({
        next: (res) => {
          this.tontines = res.data ?? [];
          this.applyFilter();
        },
        error: () => { this.hasError = true; },
      });
  }

  handleRefresh(event: any): void {
    this.loadTontines(event);
  }

  // ── Recherche ────────────────────────────────────────────────────────────────

  onSearch(value: string): void {
    this.searchQuery = value ?? '';
    this.applyFilter();
  }

  private applyFilter(): void {
    const q = this.searchQuery.trim().toLowerCase();
    this.filteredTontines = q
      ? this.tontines.filter(t => t.name.toLowerCase().includes(q))
      : [...this.tontines];
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  openTontine(t: Tontine): void {
    if (t.currentTurn === 0 && t.status === 'pending') {
      this.router.navigate(['/tontines', t.id, 'overview']);
    } else {
      this.router.navigate(['/tontines', t.id, 'overview']);
    }
  }

  createTontine(): void { this.router.navigate(['/tontines/create']); }
  joinTontine(): void { this.router.navigate(['/tontines/join']); }
  openHelp(): void { this.router.navigate(['/help']); }
  goToProfile(): void { this.router.navigate(['/profile']); }

  // ── UI helpers ───────────────────────────────────────────────────────────────

  getInitials(): string {
    return (this.user?.fullName ?? '')
      .split(' ')
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  }

  get hasTontines(): boolean { return this.tontines.length > 0; }
  get isEmpty(): boolean { return !this.isLoading && !this.hasError && this.tontines.length === 0; }

  // ── Labels (délégués au service, typés) ─────────────────────────────────────

  frequencyLabel(f: Frequency): string { return this.tontineService.frequencyLabel(f); }
  statusLabel(s: TontineStatus): string { return this.tontineService.statusLabel(s); }
  statusColor(s: TontineStatus): string { return this.tontineService.statusColor(s); }
  typeLabel(t: TontineType): string { return this.tontineService.typeLabel(t); }

  // ── Progression ──────────────────────────────────────────────────────────────

  progress(t: Tontine): number {
    if (!t.totalTurns || t.totalTurns === 0) return 0;
    return Math.min((t.currentTurn / t.totalTurns) * 100, 100);
  }

  // ── Dates (corrigées) ────────────────────────────────────────────────────────

  /**
   * Convertit n'importe quel format de date Firestore/ISO en objet Date.
   * Gère : Firestore Timestamp ({ toDate() }), string ISO, number (epoch ms).
   */
  private toDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();   // Firestore Timestamp
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  /** Prochaine date de cotisation (ex: "12 juin") */
  nextPaymentLabel(t: Tontine): string {
    if (t.status === 'completed') return 'Terminée';
    if (t.status === 'cancelled') return 'Annulée';
    const d = this.toDate(t.nextPaymentDate);
    if (!d) return '—';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  }

  /** Date de début formatée (ex: "Démarré le 1 janvier 2025") */
  startedAtLabel(t: Tontine): string {
    const d = this.toDate(t.startedAt);
    if (!d) return '';
    return 'Démarré le ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** Date de création (ex: "Créé le 5 mai 2025") */
  createdAtLabel(t: Tontine): string {
    const d = this.toDate(t.createdAt);
    if (!d) return '';
    return 'Créé le ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  onImageError(t: Tontine): void { t.iconUrl = null; }

  skeletons = Array(3);
}