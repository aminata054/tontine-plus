import {
  Component, OnInit, OnDestroy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonIcon,
  ToastController, AlertController, IonTitle
} from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';

import { VoteService, VoteTypeConfig, VOTE_TYPE_CONFIGS } from 'src/app/core/services/vote.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { TontineService } from 'src/app/core/services/tontine.service';
import { TontineVote, VoteStatus, VoteResult } from 'src/app/core/models/vote.model';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { UserProfile } from 'src/app/core/models/auth.model';

interface VoteForm {
  title: string;
  description: string;
  expiresInHours: number | null;
  meta: Record<string, any>;
}

@Component({
  selector: 'app-vote-list',
  templateUrl: './vote-list.page.html',
  styleUrls: ['./vote-list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonContent, IonHeader, IonToolbar, IonIcon,
    PageHeaderComponent,
  ],
})
export class VoteListPage implements OnInit, OnDestroy {

  tontineId!: string;
  tontine: any = null;
  members: any[] = [];
  currentUid = '';
  myRole = 'member';

  votes: TontineVote[] = [];
  filteredVotes: TontineVote[] = [];
  loading = true;
  submitting = false;

  // ── Filtres ──────────────────────────────────────────────────────────────
  statusFilters = [
    { label: 'Tous', value: 'all' },
    { label: 'En cours', value: 'open' },
    { label: 'Terminés', value: 'closed' },
  ];
  activeFilter = 'all';

  // ── Création ─────────────────────────────────────────────────────────────
  showCreateModal = false;
  createStep = 1;
  selectedTypeConfig: VoteTypeConfig | null = null;
  availableTypes: VoteTypeConfig[] = [];

  form: VoteForm = {
    title: '',
    description: '',
    expiresInHours: null,
    meta: {},
  };

  // Champs de règle modifiables
  ruleFields = [
    { field: 'amount', label: 'Montant de cotisation', type: 'number', placeholder: '5000' },
    { field: 'rules.gracePeriodDays', label: 'Délai de grâce (jours)', type: 'number', placeholder: '3' },
    { field: 'rules.penaltyValue', label: 'Valeur de la pénalité', type: 'number', placeholder: '5' },
    { field: 'rules.autoExclusionDays', label: 'Délai d\'exclusion auto', type: 'number', placeholder: '14' },
  ];

  private destroy$ = new Subject<void>();

  // ── Exposer Object pour le template ─────────────────────────────────────
  readonly Object = Object;

  constructor(
    public voteService: VoteService,
    private authService: AuthService,
    private tontineService: TontineService,
    private route: ActivatedRoute,
    private router: Router,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.tontineId = this.route.snapshot.paramMap.get('tontineId')!;


    this.authService.currentUser$
      .pipe(filter((u): u is UserProfile => !!u), take(1), takeUntil(this.destroy$))
      .subscribe(u => {
        this.currentUid = u.uid;
        this.cdr.detectChanges();
        this.initPage();
      });

    const cached = this.authService.currentUser;
    if (cached && !this.currentUid) {
      this.currentUid = cached.uid;
      this.cdr.detectChanges();
      this.initPage();
    }
  }

  private initPage(): void {
    // Charger la tontine
    this.tontineService.getTontineById(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        if (res.success) {
          this.tontine = res.data;
          this.myRole = res.data.myRole ?? 'member';
          this.availableTypes = this.voteService.getAvailableTypes(this.myRole);
          this.cdr.detectChanges();
        }
      });

    // Charger les membres
    this.tontineService.getTontineMembers(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        if (res.success) {
          this.members = res.data;
          this.cdr.detectChanges();
        }
      });

    // S'abonner aux votes en temps réel
    this.voteService.subscribeToVotes(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(votes => {
        this.votes = votes;
        this.loading = false;
        this.applyFilter();
        this.cdr.detectChanges();
      });
  }

  // ── Filtres ──────────────────────────────────────────────────────────────

  setFilter(value: string): void {
    this.activeFilter = value;
    this.applyFilter();
  }

  private applyFilter(): void {
    if (this.activeFilter === 'all') {
      this.filteredVotes = this.votes;
    } else {
      this.filteredVotes = this.votes.filter(v => v.status === this.activeFilter);
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  openVoteDetail(vote: TontineVote): void {
    this.router.navigate(['/tontines', this.tontineId, 'votes', vote.id]);
  }

  // ── Création ─────────────────────────────────────────────────────────────

  openCreateModal(): void {
    this.form = { title: '', description: '', expiresInHours: null, meta: {} };
    this.createStep = 1;
    this.selectedTypeConfig = null;
    this.showCreateModal = true;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  selectVoteType(config: VoteTypeConfig): void {
    this.selectedTypeConfig = config;
    this.form.meta = {};
    this.createStep = 2;
  }

  onRuleFieldChange(): void {
    this.form.meta['proposedValue'] = null;
  }

  canSubmit(): boolean {
    if (!this.form.title.trim() || this.form.title.trim().length < 5) return false;
    if (!this.selectedTypeConfig) return false;

    const type = this.selectedTypeConfig.type;

    if (type === 'rule_change') {
      return !!this.form.meta['field'] && this.form.meta['proposedValue'] !== null && this.form.meta['proposedValue'] !== '';
    }
    if (type === 'member_exclusion') {
      return !!this.form.meta['targetUid'] && !!this.form.meta['reason']?.trim();
    }
    if (type === 'role_change') {
      return !!this.form.meta['targetUid'] && !!this.form.meta['proposedRole'];
    }
    if (type === 'turn_swap') {
      return !!this.form.meta['uid1'] && !!this.form.meta['uid2'] && this.form.meta['uid1'] !== this.form.meta['uid2'];
    }
    return true;
  }

  submitVote(): void {
    if (!this.canSubmit() || !this.selectedTypeConfig) return;
    this.submitting = true;

    // Enrichir les métadonnées avant envoi
    const meta = { ...this.form.meta };

    if (this.selectedTypeConfig.type === 'rule_change') {
      meta['label'] = this.voteService.getRuleFieldLabel(meta['field']);
      meta['currentValue'] = this.getCurrentRuleValue(meta['field']);
    }

    if (this.selectedTypeConfig.type === 'member_exclusion') {
      const targetMember = this.members.find(m => m.id === meta['targetUid']);
      meta['targetName'] = targetMember?.userName ?? null;
    }

    if (this.selectedTypeConfig.type === 'role_change') {
      const targetMember = this.members.find(m => m.id === meta['targetUid']);
      meta['targetName'] = targetMember?.userName ?? null;
      meta['currentRole'] = targetMember?.role ?? 'member';
    }

    if (this.selectedTypeConfig.type === 'turn_swap') {
      const m1 = this.members.find(m => m.id === meta['uid1']);
      const m2 = this.members.find(m => m.id === meta['uid2']);
      meta['name1'] = m1?.userName ?? null;
      meta['turn1'] = m1?.turnNumber ?? null;
      meta['name2'] = m2?.userName ?? null;
      meta['turn2'] = m2?.turnNumber ?? null;
    }

    this.voteService.createVote(this.tontineId, {
      type: this.selectedTypeConfig.type,
      title: this.form.title.trim(),
      description: this.form.description.trim() || undefined,
      expiresInHours: this.form.expiresInHours ?? undefined,
      meta: meta as any,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: async (res) => {
        this.submitting = false;
        this.closeCreateModal();
        const toast = await this.toastCtrl.create({
          message: 'Vote créé, les membres ont été notifiés',
          duration: 3000,
          color: 'success',
          position: 'top',
        });
        await toast.present();
      },
      error: async (err) => {
        this.submitting = false;
        const toast = await this.toastCtrl.create({
          message: err?.error?.error ?? 'Erreur lors de la création du vote',
          duration: 3000,
          color: 'danger',
          position: 'top',
        });
        await toast.present();
      },
    });
  }

  // ── Utilitaires template ─────────────────────────────────────────────────

  getUserChoice(vote: TontineVote): string | null {
    return this.voteService.getUserChoice(vote, this.currentUid);
  }

  formatChoice(choice: string): string {
    if (choice === 'yes') return 'Pour ✅';
    if (choice === 'no') return 'Contre ❌';
    const member = this.members.find(m => m.id === choice);
    return member?.userName ?? choice;
  }

  formatDate(ts: any): string {
    if (!ts) return '';
    const date = ts?.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getCurrentRuleValue(field: string): any {
    if (!this.tontine) return null;
    const parts = field.split('.');
    let obj: any = this.tontine;
    for (const p of parts) obj = obj?.[p];
    return obj ?? null;
  }

  getRuleInputType(field: string): string {
    return 'number';
  }

  getRuleInputPlaceholder(field: string): string {
    return this.ruleFields.find(r => r.field === field)?.placeholder ?? '';
  }

  get membersWithTurn() {
    return this.members.filter(m => m.turnNumber !== null && m.status === 'active');
  }

  trackById(_: number, vote: TontineVote): string { return vote.id; }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.voteService.unsubscribeFromVotes(this.tontineId);
  }
}