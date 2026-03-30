import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';

import { AuthService } from 'src/app/core/services/auth.service';
import { UserProfile } from 'src/app/core/models/auth.model';
import { StateScreenComponent } from "src/app/shared/ui/state-screen/state-screen.component";

export interface Tontine {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  imageUrl: string;
}

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
  
  tontines: Tontine[] = [
    {
      id: '1',
      name: 'Sac d\'oignon 50KG',
      amount: 500,
      frequency: 'jour',
      imageUrl: 'assets/images/tontine-oignon.jpg',
    },
    {
      id: '2',
      name: 'Réfrigérateur',
      amount: 15000,
      frequency: 'mois',
      imageUrl: 'assets/images/tontine-frigo.jpg',
    },
    {
      id: '3',
      name: 'Nourriture',
      amount: 5000,
      frequency: 'semaine',
      imageUrl: 'assets/images/tontine-nourriture.jpg',
    },
  ];

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

  constructor(private auth: AuthService, private router: Router) { }

  ngOnInit(): void {
    this.user = this.auth.currentUser;
  }

  onImageError(tontine: Tontine) {
    tontine.imageUrl = '';   
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

  

  goToProfile() { this.router.navigate(['/profile']); }
  openNotifications() { this.router.navigate(['/notification-page']); }
  goToPremium() { this.router.navigate(['/premium']); }
  seeAllTontines() { this.router.navigate(['/tontines']); }
  openTontine(t: Tontine) { this.router.navigate(['/tontine', t.id]); }
  createTontine() { this.router.navigate(['/tontines/create']); }
  joinTontine() { this.router.navigate(['/tontines/join']); }
  inviteFriend() { this.router.navigate(['/invite']); }
}