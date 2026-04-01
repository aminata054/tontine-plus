import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { IonContent, IonIcon, IonSkeletonText, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { UserProfile } from 'src/app/core/models/auth.model';
import { Tontine } from 'src/app/core/models/tontine.model';
import { TontineService } from 'src/app/core/services/tontine.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { CustomButtonComponent } from "src/app/shared/ui/custom-button/custom-button.component";
import { CustomInputComponent } from "src/app/shared/ui/custom-input/custom-input.component";

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
    CustomInputComponent],
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

  // ── Chargement ─────────────────────────────────────────────

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
        error: () => {
          this.hasError = true;
        },
      });
  }

  handleRefresh(event: any): void {
    this.loadTontines(event);
  }

  // ── Recherche ──────────────────────────────────────────────

  onSearch(event: any): void {
    this.searchQuery = event.detail.value ?? '';
    this.applyFilter();
  }

  private applyFilter(): void {
    const q = this.searchQuery.trim().toLowerCase();
    this.filteredTontines = q
      ? this.tontines.filter(t => t.name.toLowerCase().includes(q))
      : [...this.tontines];
  }

  // ── Navigation ─────────────────────────────────────────────

  openTontine(t: Tontine): void {
    // Si la tontine n'a pas encore de tours, on redirige vers la page de succès pour afficher le lien d'invitation
    if (t.currentTurn === 0) {
      this.router.navigate(['/tontines', t.id, 'success']);
    } else {
      this.router.navigate(['/tontines', t.id, 'overview']);
    }
  }

  createTontine(): void {
    this.router.navigate(['/tontines/create']);
  }

  joinTontine(): void {
    this.router.navigate(['/tontines/join']);
  }

  openHelp(): void {
    this.router.navigate(['/help']);
  }

  goToProfile(): void {
    this.router.navigate(['/profile']);
  }

  openNotifications(): void {
    this.router.navigate(['/notifications']);
  }

  // ── UI helpers ─────────────────────────────────────────────

  getInitials(): string {
    const name = this.user?.fullName ?? '';
    return name
      .split(' ')
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  }

  get hasTontines(): boolean {
    return this.tontines.length > 0;
  }

  get isEmpty(): boolean {
    return !this.isLoading && !this.hasError && this.tontines.length === 0;
  }

  frequencyLabel(f: string): string {
    return this.tontineService.frequencyLabel(f);
  }

  statusLabel(s: string): string {
    return this.tontineService.statusLabel(s);
  }

  statusColor(s: string): string {
    return this.tontineService.statusColor(s);
  }

  /** Progression de la tontine (tour courant / total tours) */
  progress(t: Tontine): number {
    if (!t.totalTurns || t.totalTurns === 0) return 0;
    return Math.min((t.currentTurn / t.totalTurns) * 100, 100);
  }

  /** Prochaine distribution formatée */
  nextDate(t: Tontine): string {
    if (!t.nextPaymentDate) return '—';
    const d: Date = t.nextPaymentDate.toDate
      ? t.nextPaymentDate.toDate()
      : new Date(t.nextPaymentDate);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  }

  onImageError(t: Tontine): void {
    t.iconUrl = null;
  }

  skeletons = Array(3);
}