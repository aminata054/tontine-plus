import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { IonContent, IonIcon, IonSkeletonText, } from '@ionic/angular/standalone';

import { PaymentService } from 'src/app/core/services/payment.service';
import { Payment, PAYMENT_METHODS } from 'src/app/core/models/payment.model';
import { PageHeaderComponent } from 'src/app/shared/ui/page-header/page-header.component';
import { CustomButtonComponent } from 'src/app/shared/ui/custom-button/custom-button.component';

type PageStatus = 'loading' | 'success' | 'error';
type FilterType = 'all' | 'confirmed' | 'pending' | 'failed';

interface PaymentGroup {
  month: string;
  items: Payment[];
}

@Component({
  selector: 'app-payment-receipts',
  templateUrl: './payment-receipts.page.html',
  styleUrls: ['./payment-receipts.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonIcon, IonSkeletonText,
    PageHeaderComponent,
    CustomButtonComponent,
  ],
})
export class PaymentReceiptsPage implements OnInit, OnDestroy {

  status: PageStatus = 'loading';
  payments: Payment[] = [];
  activeFilter: FilterType = 'all';
  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private paymentService: PaymentService,
  ) { }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Chargement ──────────────────────────────────────────────

  load(): void {
    this.status = 'loading';
    this.paymentService.getMyPayments()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.payments = res.success ? res.data : [];
          this.status = 'success';
        },
        error: () => { this.status = 'error'; },
      });
  }

  // ── Filtres ─────────────────────────────────────────────────

  setFilter(filter: FilterType): void {
    this.activeFilter = filter;
  }

  get filteredPayments(): Payment[] {
    if (this.activeFilter === 'all') return this.payments;
    return this.payments.filter(p => p.status === this.activeFilter);
  }

  // ── Groupement par mois ──────────────────────────────────────

  get groupedPayments(): PaymentGroup[] {
    const groups: Record<string, Payment[]> = {};

    for (const p of this.filteredPayments) {
      const d = this._toDate(p.confirmedAt ?? p.paidAt ?? p.createdAt);
      const key = d
        ? d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        : 'Date inconnue';

      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }

    return Object.entries(groups).map(([month, items]) => ({ month, items }));
  }

  // ── Statistiques globales ─────────────────────────────────────

  get confirmedCount(): number {
    return this.payments.filter(p => p.status === 'confirmed').length;
  }

  get totalPaid(): number {
    return this.payments
      .filter(p => p.status === 'confirmed')
      .reduce((sum, p) => sum + (p.totalAmount ?? 0), 0);
  }

  get tontineCount(): number {
    return new Set(this.payments.map(p => p.tontineId)).size;
  }

  // ── Navigation ───────────────────────────────────────────────

  openReceipt(payment: Payment): void {
    if (payment.status !== 'confirmed') return;
    this.router.navigate(['/tontines', payment.tontineId, 'payment', payment.id]);
  }

  // ── Helpers UI ───────────────────────────────────────────────

  getMethodColor(method: string): string {
    return PAYMENT_METHODS.find(m => m.id === method)?.color ?? '#64748B';
  }

  statusLabel(status: string): string {
    return this.paymentService.statusLabel(status);
  }

  formatAmount(v: number): string {
    return this.paymentService.formatAmount(v);
  }

  formatDate(value: any): string {
    const d = this._toDate(value);
    if (!d) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private _toDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (value._seconds !== undefined) return new Date(value._seconds * 1000);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
}