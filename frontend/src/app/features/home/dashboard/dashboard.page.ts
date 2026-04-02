import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { AuthService } from 'src/app/core/services/auth.service';
import { UserProfile } from 'src/app/core/models/auth.model';
import { StateScreenComponent } from "src/app/shared/ui/state-screen/state-screen.component";
import { Tontine } from 'src/app/core/models/tontine.model';
import { finalize, Subject, takeUntil } from 'rxjs';
import { TontineService } from 'src/app/core/services/tontine.service';

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  photoUrl?: string;
  date: Date;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [IonContent, IonIcon, CommonModule, StateScreenComponent],
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
})
export class DashboardPage implements OnInit {

  user: UserProfile | null = null;
  isPremium: boolean = false;
  notifCount: number = 2;
  activeDot: number = 0;

  showSuccessState: boolean = false;
  tontines: Tontine[] = [];
  isLoading = true;
  hasError = false;


  transactions: Transaction[] = [
    {
      id: '1',
      description: 'Paiement à la tontine "Tontine Salon" réussie avec succès',
      amount: 15000,
      date: new Date(),
    },
    {
      id: '2',
      description: 'Paiement à la tontine "Tontine Salon" réussie avec succès',
      amount: 15000,
      date: new Date(),
    },
  ];

  private destroy$ = new Subject<void>();

  constructor(private auth: AuthService, private router: Router, private tontineService: TontineService,) { }

  ngOnInit(): void {
    this.user = this.auth.currentUser;
    this.auth.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(u => {
        this.user = u;
        // Afficher l'écran de bienvenue uniquement si c'est un nouveau compte
        // this.showSuccessState = !!(u && !u.hasSeenWelcome);
      });

    this.loadTontines();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onImageError(tontine: Tontine) {
    tontine.iconUrl = '';
  }
  getInitials(): string {
    if (!this.user?.fullName) return '?';
    return this.user.fullName
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  // ── Chargement ──────────────────────────────────────────────────────────────

  loadTontines(): void {
    this.hasError = false;
    this.isLoading = true;

    // On récupère seulement les 3 premières pour le dashboard
    this.tontineService.getMyTontines()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.isLoading = false; })
      )
      .subscribe({
        next: (res) => {
          this.tontines = (res.data ?? []).slice(0, 3);
        },
        error: () => { this.hasError = true; },
      });
  }



  goToProfile() { this.router.navigate(['/profile']); }
  openNotifications() { this.router.navigate(['/notification-page']); }
  goToPremium() { this.router.navigate(['/premium']); }
  seeAllTontines() { this.router.navigate(['/tontines']); }
  openTontine(t: Tontine): void {
    this.router.navigate(['/tontines', t.id, 'overview']);
  }
    createTontine() { this.router.navigate(['/tontines/create']); }
  joinTontine() { this.router.navigate(['/tontines/join']); }
  inviteFriend() { this.router.navigate(['/invite']); }
}