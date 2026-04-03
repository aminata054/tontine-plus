import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { registerIcons } from './core/constants/icon.constants';
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Router } from '@angular/router';
registerIcons();

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(private router: Router) { }

  ngOnInit(): void {
    App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
      const url = new URL(event.url);
      if (url.pathname.startsWith('/join/')) {
        const code = url.pathname.split('/join/')[1];
        if (code) this.router.navigate(['/join', code.toUpperCase()]);
      }
    });
    
  }

}
