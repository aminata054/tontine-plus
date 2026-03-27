// auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { StorageService } from '../services/storage.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const storage = inject(StorageService);

    const isFirebaseCall = req.url.includes('identitytoolkit.googleapis.com')
        || req.url.includes('securetoken.googleapis.com');

    if (isFirebaseCall) {
        return next(req);  
    }

    return from(storage.getToken()).pipe(
        switchMap(token => {
            if (token) {
                const cloned = req.clone({
                    setHeaders: { Authorization: `Bearer ${token}` }
                });
                return next(cloned);
            }
            return next(req);
        })
    );
};