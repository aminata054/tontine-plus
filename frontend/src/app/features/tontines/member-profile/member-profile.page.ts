import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import {
  IonContent, IonIcon, IonSkeletonText, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { flagOutline, alertCircleOutline } from 'ionicons/icons';

import { TontineMember } from 'src/app/core/models/tontine.model';
import { TontineService } from 'src/app/core/services/tontine.service';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';

type PageStatus = 'loading' | 'success' | 'error';

@Component({
  selector: 'app-member-profile',
  templateUrl: './member-profile.page.html',
  styleUrls: ['./member-profile.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonIcon, IonSkeletonText,
    PageHeaderComponent,
  ],
})
export class MemberProfilePage implements OnInit, OnDestroy {

  status: PageStatus = 'loading';
  member: TontineMember | null = null;

  tontineId: string | null = null;
  memberId: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tontineService: TontineService,
    private toastCtrl: ToastController,
  ) {
    addIcons({ flagOutline, alertCircleOutline });
  }

  ngOnInit(): void {
    this.tontineId = this.route.snapshot.paramMap.get('id');
    this.memberId = this.route.snapshot.paramMap.get('memberId');

    this.tontineService.getMemberProfile(this.tontineId!, this.memberId!)

    if (!this.tontineId || !this.memberId) {
      this.status = 'error';
      return;
    }

    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Chargement ──────────────────────────────────────────────────────────────

  load(): void {
    this.status = 'loading';

    // On charge toute la liste puis on isole le membre ciblé.
    // Évite d'avoir besoin d'un endpoint GET /members/:uid dédié.
    this.tontineService.getTontineMembers(this.tontineId!)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { if (this.status === 'loading') this.status = 'error'; })
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            const found = res.data.find(m => m.id === this.memberId);
            if (found) {
              this.member = found;
              this.status = 'success';
            } else {
              this.status = 'error';
            }
          } else {
            this.status = 'error';
          }
        },
        error: () => { this.status = 'error'; },
      });
  }

  // ── Helpers affichage ───────────────────────────────────────────────────────

  getInitials(name: string | null | undefined): string {
    return (name ?? '')
      .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  }

  /** Convertit un Timestamp Firestore ou une Date en Date JS */
  toDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value._seconds !== undefined) return new Date(value._seconds * 1000);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  /** Score de confiance 0-5 basé sur le taux de paiements à temps */
  get trustScore(): number {
    if (!this.member) return 0;
    const { onTimePayments, latePayments, missedPayments } = this.member.stats;
    const total = onTimePayments + latePayments + missedPayments;
    if (total === 0) return 5; // nouveau membre = crédit de confiance max
    return Math.round((onTimePayments / total) * 5);
  }

  /** Tableau de 5 booléens pour les étoiles */
  get stars(): boolean[] {
    return Array.from({ length: 5 }, (_, i) => i < this.trustScore);
  }

  roleLabel(role: string): string {
    const map: Record<string, string> = {
      creator: 'Admin',
      admin: 'Admin',
      member: 'Membre',
    };
    return map[role] ?? role;
  }

  statusLabel(status: string): string {
    return this.tontineService.memberStatusLabel(status as any);
  }

  statusColor(status: string): string {
    return this.tontineService.memberStatusColor(status as any);
  }

  formatAmount(v: number): string {
    return new Intl.NumberFormat('fr-FR').format(v);
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  async report(): Promise<void> {
    // TODO : ouvrir une modale de signalement
    const toast = await this.toastCtrl.create({
      message: 'Fonctionnalité de signalement bientôt disponible.',
      duration: 2500,
      color: 'warning',
      position: 'top',
    });
    await toast.present();
  }

  goBack(): void {
    this.router.navigate(['/tontines', this.tontineId, 'overview']);
  }
}