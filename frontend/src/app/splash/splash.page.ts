import { Component } from '@angular/core';
import { IonContent, IonIcon, NavController, ViewDidEnter } from '@ionic/angular/standalone';
import { StorageService } from '../core/services/storage.service';

@Component({
  selector: 'app-splash',
  standalone: true,
  imports: [IonContent, IonIcon],
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
})
export class SplashPage implements ViewDidEnter {

  constructor(
    private navCtrl: NavController,
    private storageService: StorageService
  ) { }

  ionViewDidEnter() {
    setTimeout(async () => {
      const hasSeen = await this.storageService.hasSeenOnboarding();
      if (hasSeen) {
        this.navCtrl.navigateRoot('/login');
      } else {
        this.navCtrl.navigateRoot('/onboarding');
      }
    }, 2500);
  }
}