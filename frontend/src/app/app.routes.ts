import { Routes } from '@angular/router';
import { hasSeenOnboardingGuard } from './core/guards/has-seen-onboarding.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'splash', pathMatch: 'full' },

  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },

  {
    path: 'splash',
    loadComponent: () => import('./splash/splash.page').then(m => m.SplashPage)
  },
  {
    path: 'onboarding',
    loadComponent: () => import('./onboarding/onboarding.page').then(m => m.OnboardingPage),
    canActivate: [hasSeenOnboardingGuard]
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.page').then( m => m.RegisterPage)
  },
  {
    path: 'otp-page',
    loadComponent: () => import('./features/auth/otp-page/otp-page.page').then( m => m.OtpPagePage)
  },
  {
    path: 'profile-completion',
    loadComponent: () => import('./features/auth/profile-completion/profile-completion.page').then( m => m.ProfileCompletionPage)
  },
  {
    path: 'pin-setup',
    loadComponent: () => import('./features/auth/pin-setup/pin-setup.page').then( m => m.PinSetupPage)
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.page').then( m => m.LoginPage)
  },
];
