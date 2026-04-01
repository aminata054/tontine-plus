import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, ModalController } from '@ionic/angular/standalone';
import { CustomButtonComponent } from '../custom-button/custom-button.component';

@Component({
  selector: 'app-qr-panel',
  templateUrl: './qr-panel.component.html',
  styleUrls: ['./qr-panel.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon, CustomButtonComponent],
})
export class QrPanelComponent {
  @Input() qrUrl!: string;
  @Input() inviteCode!: string;

  constructor(private modalCtrl: ModalController) { }

  close(): void {
    this.modalCtrl.dismiss();
  }

  download(): void {
    const a = document.createElement('a');
    a.href = this.qrUrl;
    a.download = `qr-${this.inviteCode}.png`;
    a.click();
  }
}