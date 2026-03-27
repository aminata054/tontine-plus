import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StorageService } from '../services/storage.service';

export const hasSeenOnboardingGuard: CanActivateFn = async () => {
    const storage = inject(StorageService);
    const router = inject(Router);

    const hasSeen = await storage.hasSeenOnboarding();

    if (hasSeen) {
        await router.navigate(['/login'], { replaceUrl: true });
        return false;
    }
    return true;
};