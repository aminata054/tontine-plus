import { HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap, catchError, throwError, BehaviorSubject, filter, take } from 'rxjs';
import { StorageService } from '../services/storage.service';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

// Évite plusieurs refreshs simultanés
let isRefreshing = false;
const refreshDone$ = new BehaviorSubject<boolean>(false);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const storage = inject(StorageService);
    const auth = inject(AuthService);
    const router = inject(Router);

    const isFirebaseCall = req.url.includes('identitytoolkit.googleapis.com')
        || req.url.includes('securetoken.googleapis.com');

    const isRefreshCall = req.url.includes('/auth/refresh');

    if (isFirebaseCall || isRefreshCall) return next(req);

    return from(storage.getToken()).pipe(
        switchMap(token => {
            const cloned = token
                ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
                : req;

            return next(cloned).pipe(
                catchError(error => {
                    // Uniquement sur 401
                    if (error.status !== HttpStatusCode.Unauthorized) {
                        return throwError(() => error);
                    }

                    // Un refresh est déjà en cours, attendre qu'il termine
                    if (isRefreshing) {
                        return refreshDone$.pipe(
                            filter(done => done),
                            take(1),
                            switchMap(() => from(storage.getToken()).pipe(
                                switchMap(newToken => {
                                    const retried = newToken
                                        ? req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } })
                                        : req;
                                    return next(retried);
                                })
                            ))
                        );
                    }

                    // Lancer le refresh
                    isRefreshing = true;
                    refreshDone$.next(false);

                    return auth.refreshSession().pipe(
                        switchMap(success => {
                            isRefreshing = false;
                            refreshDone$.next(true);

                            if (!success) {
                                // Refresh impossible, déconnexion
                                auth.logout().then(() => router.navigate(['/login']));
                                return throwError(() => error);
                            }

                            // Rejouer la requête originale avec le nouveau token
                            return from(storage.getToken()).pipe(
                                switchMap(newToken => {
                                    const retried = newToken
                                        ? req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } })
                                        : req;
                                    return next(retried);
                                })
                            );
                        }),
                        catchError(refreshError => {
                            isRefreshing = false;
                            auth.logout().then(() => router.navigate(['/login']));
                            return throwError(() => refreshError);
                        })
                    );
                })
            );
        })
    );
};