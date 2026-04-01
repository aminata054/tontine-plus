import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, ModalController, ToastController } from '@ionic/angular/standalone';
import { CustomButtonComponent } from '../custom-button/custom-button.component';

@Component({
  selector: 'app-share-panel',
  templateUrl: './share-panel.component.html',
  styleUrls: ['./share-panel.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon, CustomButtonComponent],
})
export class SharePanelComponent {
  @Input() inviteLink!: string;

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
  ) { }

  close(): void {
    this.modalCtrl.dismiss();
  }

  async copyLink(): Promise<void> {
    await navigator.clipboard.writeText(this.inviteLink);
    const t = await this.toastCtrl.create({
      message: '✓ Lien copié !',
      duration: 2000,
      position: 'bottom',
      color: 'success',
    });
    await t.present();
  }

  shareVia(platform: string): void {
    const link = encodeURIComponent(this.inviteLink);
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${link}`,
      twitter: `https://twitter.com/intent/tweet?url=${link}`,
      gmail: `mailto:?body=${link}`,
      telegram: `https://t.me/share/url?url=${link}`,
      snapchat: `https://www.snapchat.com/share?url=${link}`,
    };
    if (urls[platform]) window.open(urls[platform], '_blank');
  }
}