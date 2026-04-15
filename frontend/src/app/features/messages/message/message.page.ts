import {
  Component, OnInit, OnDestroy, ViewChild,
  ElementRef, AfterViewChecked, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonIcon,
  ToastController, AlertController,
} from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';

import { ChatService } from 'src/app/core/services/chat.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { ChatMessage } from 'src/app/core/models/chat.model';
import { PageHeaderComponent } from "src/app/shared/ui/page-header/page-header.component";
import { TontineService } from 'src/app/core/services/tontine.service';
import { UserProfile } from 'src/app/core/models/auth.model';

@Component({
  selector: 'app-message',
  templateUrl: './message.page.html',
  styleUrls: ['./message.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonContent, IonHeader, IonToolbar, IonIcon,
    PageHeaderComponent
  ],
})
export class MessagePage implements OnInit, OnDestroy, AfterViewChecked {

  @ViewChild('scrollContent') content!: IonContent;
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('msgInput') msgInput!: ElementRef;

  tontineId!: string;
  tontineName = '';
  tontineIcon: string | null = null;
  membersCount = 0;
  user: UserProfile | null = null;

  messages: ChatMessage[] = [];
  currentUid = '';          // ← initialisé à '' (jamais undefined)
  isAdmin = false;
  isSending = false;
  hasMore = false;
  loadingMore = false;
  someoneTyping = false;
  inputHeight = 'auto';

  messageText = '';
  replyingTo: ChatMessage | null = null;
  selectedMessage: ChatMessage | null = null;

  showVoteModal = false;
  voteQuestion = '';
  voteOptions: string[] = ['', ''];
  voteExpiresHours: number | null = null;

  quickEmojis = ['👍', '❤️', '😂', '😮', '🙏', '🔥'];

  private destroy$ = new Subject<void>();
  private shouldScrollBottom = true;
  private typingTimer: any;

  constructor(
    public chatService: ChatService,
    private authService: AuthService,
    private tontineService: TontineService,
    private route: ActivatedRoute,
    private router: Router,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.tontineId = this.route.snapshot.paramMap.get('id')!;

  
    this.authService.currentUser$
      .pipe(
        filter((u): u is UserProfile => !!u),  
        take(1),                                
        takeUntil(this.destroy$)
      )
      .subscribe(u => {
        this.user = u;
        this.currentUid = u.uid;                  
        this.cdr.detectChanges();                  
        this.initPage();
      });

    const cached = this.authService.currentUser;
    if (cached && !this.currentUid) {
      this.user = cached;
      this.currentUid = cached.uid;
      this.cdr.detectChanges();
      this.initPage();
    }
  }

  private initPage(): void {
    const state = history.state;

    this.tontineName = state?.tontineName ?? 'Discussion';
    this.tontineIcon = state?.tontineIcon ?? null;
    this.isAdmin = state?.isAdmin ?? false;
    this.membersCount = state?.membersCount ?? 0;

    if (!this.membersCount || !state?.tontineName) {
      this.tontineService.getTontineById(this.tontineId)
        .pipe(takeUntil(this.destroy$))
        .subscribe(res => {
          if (res.success) {
            this.tontineName = res.data.name;
            this.tontineIcon = res.data.iconUrl ?? null;
            this.membersCount = res.data.totalMembers ?? 0;
            this.isAdmin =
              res.data.myRole === 'creator' ||
              res.data.myRole === 'admin';
            this.cdr.detectChanges();
          }
        });
    }

    this.subscribeMessages();
  }

  private subscribeMessages(): void {
    this.chatService.subscribeToMessages(this.tontineId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (messages) => {
          this.messages = messages;
          this.shouldScrollBottom = true;
          this.cdr.detectChanges();   
        },
        error: (err) => console.error('[MessagePage]', err)
      });
  }

  
  isOwn(msg: ChatMessage): boolean {
    return !!this.currentUid && msg.senderId === this.currentUid;
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
      this.shouldScrollBottom = false;
    }
  }

  private scrollToBottom(): void {
    this.content?.scrollToBottom(300);
  }

  async sendMessage(): Promise<void> {
    const text = this.messageText.trim();
    if (!text || this.isSending) return;

    this.isSending = true;
    this.messageText = '';
    this.inputHeight = 'auto';
    this.replyingTo = null;

    this.chatService.sendMessage(this.tontineId, text)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSending = false;
          this.shouldScrollBottom = true;
        },
        error: async () => {
          this.isSending = false;
          this.messageText = text;
          const toast = await this.toastCtrl.create({
            message: 'Erreur lors de l\'envoi du message',
            duration: 2500,
            color: 'danger',
            position: 'top',
          });
          await toast.present();
        },
      });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onTyping(): void {
    const el = this.msgInput?.nativeElement;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }

  loadMoreMessages(): void {
    if (this.loadingMore || !this.hasMore) return;
    this.loadingMore = true;
    const oldestId = this.messages[0]?.id;
    this.chatService.getMessages(this.tontineId, 30, oldestId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.messages = [...res.data, ...this.messages];
          this.hasMore = res.hasMore;
          this.loadingMore = false;
        },
        error: () => { this.loadingMore = false; },
      });
  }

  react(msg: ChatMessage, emoji: string): void {
    this.selectedMessage = null;
    this.chatService.reactToMessage(this.tontineId, msg.id, emoji as any)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  castVote(msg: ChatMessage, optionId: string): void {
    if (msg.vote?.status === 'closed') return;
    if (this.getUserVote(msg) === optionId) return;
    this.chatService.castVote(this.tontineId, msg.id, optionId)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  closeVote(msg: ChatMessage): void {
    this.chatService.closeVote(this.tontineId, msg.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  openVoteModal(): void {
    this.voteQuestion = '';
    this.voteOptions = ['', ''];
    this.voteExpiresHours = null;
    this.showVoteModal = true;
  }

  closeVoteModal(): void { this.showVoteModal = false; }

  addVoteOption(): void {
    if (this.voteOptions.length < 6) this.voteOptions.push('');
  }

  removeVoteOption(i: number): void { this.voteOptions.splice(i, 1); }

  canSubmitVote(): boolean {
    return (
      this.voteQuestion.trim().length >= 5 &&
      this.voteOptions.filter(o => o.trim().length > 0).length >= 2
    );
  }

  submitVote(): void {
    if (!this.canSubmitVote()) return;
    this.chatService.createVote(this.tontineId, {
      question: this.voteQuestion.trim(),
      options: this.voteOptions.filter(o => o.trim()),
      expiresInHours: this.voteExpiresHours ?? undefined,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.closeVoteModal();
        this.shouldScrollBottom = true;
      },
    });
  }

  async deleteMessage(msg: ChatMessage): Promise<void> {
    if (!this.isOwn(msg) && !this.isAdmin) return;
    const alert = await this.alertCtrl.create({
      header: 'Supprimer le message',
      message: 'Cette action est irréversible.',
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        {
          text: 'Supprimer',
          role: 'destructive',
          handler: () => {
            this.chatService.deleteMessage(this.tontineId, msg.id)
              .pipe(takeUntil(this.destroy$))
              .subscribe();
            this.selectedMessage = null;
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Utilitaires template ─────────────────────────────────────

  getVoteResults(msg: ChatMessage) {
    if (!msg.vote) return [];
    return this.chatService.getVotePercentages(msg.vote.votes, msg.vote.options);
  }

  getUserVote(msg: ChatMessage): string | null {
    return msg.vote?.votes?.[this.currentUid] ?? null;
  }

  getTotalVotes(msg: ChatMessage): number {
    return Object.keys(msg.vote?.votes ?? {}).length;
  }

  hasReactions(msg: ChatMessage): boolean {
    return Object.values(msg.reactions ?? {}).some(list => list.length > 0);
  }

  getReactionList(msg: ChatMessage): { emoji: string; count: number; includes: string[] }[] {
    return Object.entries(msg.reactions ?? {})
      .filter(([, uids]) => uids.length > 0)
      .map(([emoji, uids]) => ({ emoji, count: uids.length, includes: uids }));
  }

  isReadByAll(msg: ChatMessage): boolean {
    return msg.readBy?.length >= this.membersCount;
  }

  showDateSeparator(i: number): boolean {
    if (i === 0) return true;
    const prev = this.messages[i - 1];
    const curr = this.messages[i];
    if (!prev?.createdAt || !curr?.createdAt) return false;
    const prevDate = prev.createdAt?.toDate?.() ?? new Date(prev.createdAt);
    const currDate = curr.createdAt?.toDate?.() ?? new Date(curr.createdAt);
    return prevDate.toDateString() !== currDate.toDateString();
  }

  showSenderName(i: number): boolean {
    if (i === 0) return true;
    return this.messages[i - 1]?.senderId !== this.messages[i]?.senderId;
  }

  formatDate(ts: any): string {
    if (!ts) return '';
    const date = ts?.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) return 'Aujourd\'hui';
    if (diffDays === 1) return 'Hier';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  getInitials(name: string | null): string {
    return this.chatService.getInitials(name);
  }

  trackById(_: number, msg: ChatMessage): string { return msg.id; }

  onLongPress(msg: ChatMessage): void {
    if (msg.deletedAt) return;
    this.selectedMessage = msg;
  }

  clearSelection(): void { this.selectedMessage = null; }

  replyTo(msg: ChatMessage): void {
    this.replyingTo = msg;
    this.selectedMessage = null;
    this.msgInput?.nativeElement?.focus();
  }

  cancelReply(): void { this.replyingTo = null; }

  openTontineDetail(): void {
    this.router.navigate(['/tontines', this.tontineId]);
  }

  openOptions(): void { }
  openAttachment(): void { }

  onScroll(event: any): void {
    if (event.detail.scrollTop < 50 && this.hasMore && !this.loadingMore) {
      this.loadMoreMessages();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.chatService.unsubscribeFromMessages(this.tontineId);
    clearTimeout(this.typingTimer);
  }
}