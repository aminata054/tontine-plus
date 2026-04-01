import { Routes } from '@angular/router';
import { hasSeenOnboardingGuard } from './core/guards/has-seen-onboarding.guard';
import { AuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'splash',
    pathMatch: 'full'
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
    loadComponent: () => import('./features/auth/register/register.page').then(m => m.RegisterPage)
  },
  {
    path: 'otp-page',
    loadComponent: () => import('./features/auth/otp-page/otp-page.page').then(m => m.OtpPagePage)
  },
  {
    path: 'profile-completion',
    loadComponent: () => import('./features/auth/profile-completion/profile-completion.page').then(m => m.ProfileCompletionPage)
  },
  {
    path: 'pin-setup',
    loadComponent: () => import('./features/auth/pin-setup/pin-setup.page').then(m => m.PinSetupPage)
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.page').then(m => m.LoginPage)
  },
  {
    path: '',
    loadComponent: () => import('./features/tabs/tabs.page').then(m => m.TabsPage),
    canActivate: [AuthGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/home/dashboard/dashboard.page').then(m => m.DashboardPage),
        title: 'Accueil'
      },
      {
        path: 'tontines',
        loadComponent: () => import('./features/tontines/layout/layout.page').then(m => m.LayoutPage),
        children: [
          {
            path: '',
            loadComponent: () => import('./features/tontines/tontine/tontine.page').then(m => m.TontinePage),
          },
          {
            path: 'create',
            loadComponent: () => import('./features/tontines/create/create.page').then(m => m.CreatePage),
          },
          {
            path: ':id/success',
            loadComponent: () => import('./features/tontines/success/success.page').then(m => m.SuccessPage)
          },

          {
            path: 'join',
            loadComponent: () => import('./features/tontines/join/join.page').then(m => m.JoinPage),
          },
          {
            path: ':id/overview',
            loadComponent: () => import('./features/tontines/overview/overview.page').then(m => m.OverviewPage),
          },
          {
            path: ':id/flow',
            loadComponent: () => import('./features/tontines/flow/flow.page').then(m => m.FlowPage),
          },
          {
            path: ':id/history',
            loadComponent: () => import('./features/tontines/history/history.page').then(m => m.HistoryPage),
          },
          {
            path: ':id/settings',
            loadComponent: () => import('./features/tontines/settings/settings.page').then(m => m.SettingsPage),
          }
        ]
      },
      {
        path: 'messages',
        loadComponent: () => import('./features/messages/message/message.page').then(m => m.MessagePage),
        children: [
          {
            path: 'conversation',
            loadComponent: () => import('./features/messages/conversation/conversation.page').then(m => m.ConversationPage)
          },
        ]
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/layout/layout.page').then(m => m.LayoutPage),
        children: [
          {
            path: '',
            loadComponent: () => import('./features/profile/profile/profile.page').then(m => m.ProfilePage),
          },
          {
            path: 'help-center',
            loadComponent: () => import('./features/profile/help-center/help-center.page').then(m => m.HelpCenterPage)
          },
          {
            path: 'about',
            loadComponent: () => import('./features/profile/about/about.page').then(m => m.AboutPage)
          },
          {
            path: 'account',
            loadComponent: () => import('./features/profile/account/account.page').then(m => m.AccountPage)
          },
          {
            path: 'feedback',
            loadComponent: () => import('./features/profile/feedback/feedback.page').then(m => m.FeedbackPage)
          },
          {
            path: 'change-pin',
            loadComponent: () => import('./features/profile/change-pin/change-pin.page').then(m => m.ChangePinPage)
          },
        ]
      },

      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  },

  {
    path: 'subscription-list',
    loadComponent: () => import('./features/subscription/subscription-list/subscription-list.page').then(m => m.SubscriptionListPage)
  },
  {
    path: 'premium',
    loadComponent: () => import('./features/subscription/premium/premium.page').then(m => m.PremiumPage)
  },
  {
    path: 'notification-page',
    loadComponent: () => import('./features/notifications/notification-page/notification-page.page').then(m => m.NotificationPagePage)
  },
];
