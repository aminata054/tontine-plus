import {
  Component, OnInit, OnDestroy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  IonContent, IonHeader, IonIcon,
  ToastController, AlertController,
} from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';

import { VoteService } from 'src/app/core/services/vote.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { TontineService } from 'src/app/core/services/tontine.service';
import {
  TontineVote, VoteResult,
  RuleChangeMeta, MemberExclusionMeta, RoleChangeMeta, TurnSwapMeta,
  isRuleChangeMeta, isMemberExclusionMeta, isRoleChangeMeta, isTurnSwapMeta,
} from 'src/app/core/models/vote.model';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { UserProfile } from 'src/app/core/models/auth.model';

@Component({
  selector: 'app-vote-detail',
  templateUrl: './vote-detail.page.html',
  styleUrls: ['./vote-detail.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonHeader, IonIcon,
    PageHeaderComponent,
  ],
})
export class VoteDetailPage implements OnInit, OnDestroy {

  tontineId!: string;
  voteId!: string;

  vote: TontineVote | null = null;
  members: any[] = [];
  currentUid = '';
  isAdmin = false;
  totalMembers = 0;
  loading = true;
  casting = false;

  readonly Object = Object;

  private destroy$ = new Subject<void>();

  constructor(
    public voteService: VoteService,
    private authService: AuthService,
    private tontineService: TontineService,
    private route: ActivatedRoute,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.tontineId = this.route.snapshot.paramMap.get('tontineId')!;
    this.voteId = this.route.snapshot.paramMap.get('voteId')!;

    this.authService.currentUser$
      .pipe(filter((u): u is UserProfile => !!u), take(1), takeUntil(this.destroy$))
      .subscribe(u => {
        this.currentUid = u.uid;
        this.initPage();
      });

    const cached = this.authService.currentUser;
    if (cached && !this.currentUid) {
      this.currentUid = cached.uid;
      this.initPage();
    }
  }

  private initPage(): void {
    // ── Un seul appel getTontineById ────────────────────────────────────────
    this.tontineService.getTontineById(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        if (res.success) {
          this.isAdmin = ['creator', 'admin'].includes(res.data.myRole ?? '');
          this.totalMembers = res.data.totalMembers ?? 0;
          this.cdr.detectChanges();
        }
      });

    // ── Membres (pour afficher les noms dans next_turn_selection) ───────────
    this.tontineService.getTontineMembers(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        if (res.success) {
          this.members = res.data;
          this.cdr.detectChanges();
        }
      });

    // ── Temps réel Firestore ────────────────────────────────────────────────
    this.voteService.subscribeToVotes(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(votes => {
        const found = votes.find(v => v.id === this.voteId) ?? null;
        if (found) {
          this.vote = found;
          this.loading = false;
          this.cdr.detectChanges();
        }
      });

    // ── Fallback HTTP ───────────────────────────────────────────────────────
    this.voteService.getVoteById(this.tontineId, this.voteId)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe(res => {
        if (res.success && !this.vote) {
          this.vote = res.data;
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
  }

  // ── Type-narrowing helpers ─────────────────────────────────────────────────

  getRuleChangeMeta(vote: TontineVote): RuleChangeMeta | null {
    return isRuleChangeMeta(vote.meta) ? vote.meta : null;
  }
  getMemberExclusionMeta(vote: TontineVote): MemberExclusionMeta | null {
    return isMemberExclusionMeta(vote.meta) ? vote.meta : null;
  }
  getRoleChangeMeta(vote: TontineVote): RoleChangeMeta | null {
    return isRoleChangeMeta(vote.meta) ? vote.meta : null;
  }
  getTurnSwapMeta(vote: TontineVote): TurnSwapMeta | null {
    return isTurnSwapMeta(vote.meta) ? vote.meta : null;
  }

  // ── Utilitaires vote ──────────────────────────────────────────────────────

  getUserChoice(): string | null {
    if (!this.vote) return null;
    return this.voteService.getUserChoice(this.vote, this.currentUid);
  }

  getChoiceCount(choice: string): number {
    if (!this.vote) return 0;
    return Object.values(this.vote.votes ?? {}).filter(v => v === choice).length;
  }

  /**
   * % calculé sur totalMembers (tous les membres actifs),
   * pas sur eligibleVoters qui peut être un sous-ensemble.
   */
  getChoicePct(choice: string): number {
    if (!this.vote || !this.totalMembers) return 0;
    const count = Object.values(this.vote.votes ?? {}).filter(v => v === choice).length;
    return Math.round((count / this.totalMembers) * 100);
  }

  getTotalVotesCount(): number {
    return Object.keys(this.vote?.votes ?? {}).length;
  }

  getMemberName(uid: string): string {
    const m = this.members.find(m => m.id === uid);
    return m?.userName ?? uid;
  }

  // ── Voter ─────────────────────────────────────────────────────────────────

  castVote(choice: string): void {
    if (!this.vote || this.vote.status !== 'open') return;
    if (this.casting) return;
    if (this.getUserChoice() === choice) return;

    this.casting = true;

    this.voteService.castVote(this.tontineId, this.voteId, choice)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async (res) => {
          this.casting = false;
          if (res.data?.result) {
            const msg =
              res.data.result === 'approved' ? 'Vote approuvé, modifications appliquées' :
                res.data.result === 'rejected' ? 'Proposition rejetée par la majorité' :
                  '⚠️ Vote clôturé sans quorum suffisant';
            const color =
              res.data.result === 'approved' ? 'success' :
                res.data.result === 'rejected' ? 'danger' : 'warning';
            const toast = await this.toastCtrl.create({
              message: msg, duration: 4000, color, position: 'top',
            });
            await toast.present();
          }
        },
        error: async (err) => {
          this.casting = false;
          const toast = await this.toastCtrl.create({
            message: err?.error?.error ?? 'Erreur lors du vote',
            duration: 3000, color: 'danger', position: 'top',
          });
          await toast.present();
        },
      });
  }

  // ── Clôturer ──────────────────────────────────────────────────────────────

  async confirmClose(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Clôturer le vote',
      message: 'Le vote sera clôturé avec les résultats actuels. Cette action est irréversible.',
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        {
          text: 'Clôturer',
          handler: () => {
            this.voteService.closeVote(this.tontineId, this.voteId)
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: async (res) => {
                  const toast = await this.toastCtrl.create({
                    message: `Vote clôturé, résultat : ${res.data?.result ?? 'calculé'}`,
                    duration: 3000, color: 'medium', position: 'top',
                  });
                  await toast.present();
                },
              });
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Annuler ───────────────────────────────────────────────────────────────

  async confirmCancel(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Annuler le vote',
      message: 'Le vote sera annulé et supprimé. Aucune modification ne sera appliquée.',
      buttons: [
        { text: 'Retour', role: 'cancel' },
        {
          text: 'Annuler le vote',
          role: 'destructive',
          handler: () => {
            this.voteService.cancelVote(this.tontineId, this.voteId)
              .pipe(takeUntil(this.destroy$))
              .subscribe();
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Divers ────────────────────────────────────────────────────────────────

  formatDate(ts: any): string {
    if (!ts) return '';
    const date = ts?.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  }

  getResultIcon(result: VoteResult | null): string {
    switch (result) {
      case 'approved': return 'checkmark-circle-outline';
      case 'rejected': return 'close-circle-outline';
      case 'no_quorum': return 'alert-circle-outline';
      default: return 'help-circle-outline';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.voteService.unsubscribeFromVotes(this.tontineId);
  }
}