import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { filter, firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {

    constructor(private auth: AuthService, private router: Router) { }

    async canActivate(): Promise<boolean> {
        await firstValueFrom(
            this.auth.isLoaded$.pipe(filter(v => v))
        );

        const loggedIn = await this.auth.isLoggedIn();
        if (!loggedIn) {
            this.router.navigate(['/auth/login']);
            return false;
        }
        return true;
    }
}