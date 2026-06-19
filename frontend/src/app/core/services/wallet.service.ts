// src/app/core/services/wallet.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface WalletContribution {
    userId: string;
    userName: string;
    amount: number;
    paidAt: any;
    turnNumber: number;
}

export interface TontineWalletData {
    tontineId: string;
    currentTurn: number;
    balance: number;
    targetAmount: number;
    status: 'collecting' | 'ready' | 'distributed';
    contributions: WalletContribution[];
    lastDistributedAt: any | null;
    fillRate: number;       // 0–100
    paidCount: number;
    totalMembers: number;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
    private base = `${environment.apiUrl}/payments/wallets`;

    constructor(private http: HttpClient) { }

    getWallet(tontineId: string): Observable<{ success: boolean; data: TontineWalletData }> {
        return this.http.get<{ success: boolean; data: TontineWalletData }>(
            `${this.base}/${tontineId}`
        );
    }

    formatAmount(v: number): string {
        return new Intl.NumberFormat('fr-FR').format(v ?? 0);
    }
}