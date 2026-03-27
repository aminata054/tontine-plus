import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {

    constructor(private auth: AuthService, private router: Router) { }

    async canActivate(): Promise<boolean> {
        const loggedIn = await this.auth.isLoggedIn();
        if (!loggedIn) {
            this.router.navigate(['/login']);
            return false;
        }
        return true;
    }
}