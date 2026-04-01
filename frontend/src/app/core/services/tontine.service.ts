import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { CreateTontinePayload, CreateTontineResponse, Tontine, TontineDetailResponse, TontineInviteResponse, TontineListResponse } from '../models/tontine.model';

@Injectable({ providedIn: 'root' })
export class TontineService {

    private readonly API = environment.apiUrl + '/tontines';

    /** Cache local de la liste des tontines de l'utilisateur */
    private tontinesSubject = new BehaviorSubject<Tontine[]>([]);
    public tontines$ = this.tontinesSubject.asObservable();

    constructor(private http: HttpClient) { }

    // ── CRÉER ──────────────────────────────────────────────────
    createTontine(payload: CreateTontinePayload): Observable<CreateTontineResponse> {
        return this.http.post<CreateTontineResponse>(this.API, payload);
    }

    // ── MES TONTINES ───────────────────────────────────────────
    getMyTontines(status?: string): Observable<TontineListResponse> {
        let params = new HttpParams();
        if (status) params = params.set('status', status);

        return this.http.get<TontineListResponse>(this.API, { params }).pipe(
            tap(res => {
                if (res.success) this.tontinesSubject.next(res.data);
            })
        );
    }

    // ── DÉTAILS ────────────────────────────────────────────────
    getTontineById(id: string): Observable<TontineDetailResponse> {
        return this.http.get<TontineDetailResponse>(`${this.API}/${id}`);
    }

    // ── MODIFIER ───────────────────────────────────────────────
    updateTontine(id: string, payload: Partial<CreateTontinePayload>): Observable<any> {
        return this.http.patch<any>(`${this.API}/${id}`, payload);
    }

    // ── SUPPRIMER ──────────────────────────────────────────────
    deleteTontine(id: string): Observable<any> {
        return this.http.delete<any>(`${this.API}/${id}`);
    }

    // ── INVITATION ─────────────────────────────────────────────
    getTontineInvite(id: string): Observable<TontineInviteResponse> {
        return this.http.get<TontineInviteResponse>(`${this.API}/${id}/invite`);
    }

    // ── UTILITAIRES ────────────────────────────────────────────

    /** Fréquence lisible en français */
    frequencyLabel(frequency: string): string {
        const map: Record<string, string> = {
            daily: 'jour',
            weekly: 'semaine',
            biweekly: '2 semaines',
            monthly: 'mois',
        };
        return map[frequency] ?? frequency;
    }

    /** Statut lisible en français */
    statusLabel(status: string): string {
        const map: Record<string, string> = {
            pending: 'En attente',
            active: 'En cours',
            completed: 'Terminée',
            cancelled: 'Annulée',
        };
        return map[status] ?? status;
    }

    /** Couleur du badge de statut */
    statusColor(status: string): string {
        const map: Record<string, string> = {
            pending: 'warning',
            active: 'success',
            completed: 'medium',
            cancelled: 'danger',
        };
        return map[status] ?? 'medium';
    }

    /** Vider le cache local */
    clearCache(): void {
        this.tontinesSubject.next([]);
    }
}