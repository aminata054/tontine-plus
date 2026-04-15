import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent, IonIcon, IonRefresher, IonRefresherContent, IonHeader
} from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ChatService } from 'src/app/core/services/chat.service';
import { ConversationPreview } from 'src/app/core/models/chat.model';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomInputComponent } from "src/app/shared/ui/custom-input/custom-input.component";

@Component({
  selector: 'app-conversation',
  templateUrl: './conversation.page.html',
  styleUrls: ['./conversation.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent, IonIcon, IonRefresher, IonRefresherContent,
    PageHeaderComponent,
    CustomInputComponent
],
})
export class ConversationPage implements OnInit, OnDestroy {

  conversations: ConversationPreview[] = [];
  filtered: ConversationPreview[] = [];
  searchQuery = '';
  isLoading = true;

  private destroy$ = new Subject<void>();

  constructor(
    private chatService: ChatService,
    private router: Router,
  ) { }

  ngOnInit(): void {
    // S'abonner au cache local
    this.chatService.conversations$
      .pipe(takeUntil(this.destroy$))
      .subscribe(convs => {
        this.conversations = convs;
        this.applyFilter();
      });

    this.load();
  }

  private load(): void {
    this.isLoading = true;
    this.chatService.getMyConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.isLoading = false; },
        error: () => { this.isLoading = false; },
      });
  }

  onRefresh(event: any): void {
    this.chatService.getMyConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => event.target.complete(),
        error: () => event.target.complete(),
      });
  }

  onSearch(): void {
    this.applyFilter();
  }

  private applyFilter(): void {
    const q = this.searchQuery.toLowerCase().trim();
    this.filtered = q
      ? this.conversations.filter(c =>
        c.tontineName.toLowerCase().includes(q) ||
        (c.lastMessage ?? '').toLowerCase().includes(q)
      )
      : [...this.conversations];
  }

  openChat(conv: ConversationPreview): void {
    this.router.navigate(['/messages/conversation', conv.tontineId], {
      state: { tontineName: conv.tontineName, tontineIcon: conv.tontineIcon },
    });
  }

  formatTime(ts: any): string {
    return this.chatService.formatMessageTime(ts);
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }

  trackByTontineId(_: number, conv: ConversationPreview): string {
    return conv.tontineId;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}