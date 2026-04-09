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
  @Input() link!: string;
  @Input() title: string = 'Partager le lien';
  @Input() shareText: string = '';

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
  ) { }

  close(): void {
    this.modalCtrl.dismiss();
  }

  async copyLink(): Promise<void> {
    await navigator.clipboard.writeText(this.link);
    const t = await this.toastCtrl.create({
      message: 'Lien copié !',
      duration: 2000,
      position: 'bottom',
      color: 'success',
    });
    await t.present();
  }

  shareVia(platform: string): void {
    const text = encodeURIComponent(this.shareText || this.link);
    const url = encodeURIComponent(this.link);

    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      gmail: `mailto:?subject=Invitation&body=${text}%20${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${text}`,
      snapchat: `https://www.snapchat.com/share?url=${url}`,
    };

    if (urls[platform]) window.open(urls[platform], '_blank');
  }
}