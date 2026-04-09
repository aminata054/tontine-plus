import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonSpinner, ModalController } from '@ionic/angular/standalone';

import { TontineService } from 'src/app/core/services/tontine.service';
import { StateScreenComponent } from 'src/app/shared/ui/state-screen/state-screen.component';
import { QrPanelComponent } from 'src/app/shared/ui/qr-panel/qr-panel.component';
import { SharePanelComponent } from 'src/app/shared/ui/share-panel/share-panel.component';
import { PageHeaderComponent } from "src/app/shared/ui/page-header/page-header.component";

@Component({
  selector: 'app-success',
  templateUrl: './success.page.html',
  styleUrls: ['./success.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonSpinner,
    StateScreenComponent,
    PageHeaderComponent
  ],
})
export class SuccessPage implements OnInit {

  status: 'loading' | 'success' | 'error' = 'loading';
  inviteLink: string | null = null;
  inviteCode: string | null = null;
  qrUrl: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tontineService: TontineService,
    private modalCtrl: ModalController,
  ) { }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.status = 'error'; return; }

    this.tontineService.getTontineInvite(id).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.inviteCode = res.data.inviteCode;
          this.inviteLink = res.data.inviteLink;
          this.qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(res.data.inviteLink)}`;
          this.status = 'success';
        } else {
          this.status = 'error';
        }
      },
      error: () => { this.status = 'error'; },
    });
  }

  async openQrModal(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: QrPanelComponent,
      componentProps: {
        qrUrl: this.qrUrl,
        inviteCode: this.inviteCode,
      },
      breakpoints: [0, 0.6, 0.9],
      initialBreakpoint: 0.6,
      backdropDismiss: true,
      cssClass: 'panel-modal',
    });
    await modal.present();
  }

  async openShareModal(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: SharePanelComponent,
      componentProps: {
        link: this.inviteLink,
        title: 'Partager la tontine',
        // shareText: shareText,
      },
      breakpoints: [0, 0.6, 0.9],
      initialBreakpoint: 0.6,
      backdropDismiss: true,
      cssClass: 'panel-modal',
    });
    await modal.present();
  }

  goToList(): void {
    this.router.navigate(['/tontines']);
  }
}