import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import {
  IonContent, IonIcon, IonSkeletonText, 
} from '@ionic/angular/standalone';

import { TontineMember } from 'src/app/core/models/tontine.model';
import { TontineService } from 'src/app/core/services/tontine.service';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';

type PageStatus = 'loading' | 'success' | 'error';

@Component({
  selector: 'app-members',
  templateUrl: './members.page.html',
  styleUrls: ['./members.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    IonSkeletonText,
    PageHeaderComponent,
    CustomButtonComponent,
  ],
})
export class MembersPage implements OnInit, OnDestroy {

  status: PageStatus = 'loading';
  members: TontineMember[] = [];
  totalMembers = 0;

  tontineId: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tontineService: TontineService,
  ) { }

  ngOnInit(): void {
    this.tontineId = this.route.snapshot.paramMap.get('id');
    if (!this.tontineId) { this.status = 'error'; return; }
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Chargement ──────────────────────────────────────────────────────────────

  load(): void {
    this.status = 'loading';
    this.tontineService.getTontineMembers(this.tontineId!)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { if (this.status === 'loading') this.status = 'error'; })
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.members = res.data
              .filter(m => m.status === 'active')
              .sort((a, b) => {
                const order: Record<string, number> = { creator: 0, admin: 1, member: 2 };
                return (order[a.role] ?? 3) - (order[b.role] ?? 3);
              });
            this.totalMembers = res.data.length;
            this.status = 'success';
          } else {
            this.status = 'error';
          }
        },
        error: () => { this.status = 'error'; },
      });
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  openMemberProfile(memberId: string): void {
    this.router.navigate(['/tontines', this.tontineId, 'member-profile', memberId]);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  getInitials(name: string | null | undefined): string {
    return (name ?? '')
      .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  }
}