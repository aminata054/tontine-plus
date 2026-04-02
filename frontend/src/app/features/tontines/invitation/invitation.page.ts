import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonSpinner, ModalController } from '@ionic/angular/standalone';
import { PageHeaderComponent } from "src/app/shared/ui/page-header/page-header.component";
import { ActivatedRoute, Router } from '@angular/router';
import { TontineService } from 'src/app/core/services/tontine.service';
import { QrPanelComponent } from 'src/app/shared/ui/qr-panel/qr-panel.component';
import { SharePanelComponent } from 'src/app/shared/ui/share-panel/share-panel.component';
import { CustomButtonComponent } from "src/app/shared/ui/custom-button/custom-button.component";

export interface Invitations {
  id: string;
  name: string;
  photoUrl?: string;
  date: Date;
}

@Component({
  selector: 'app-invitation',
  templateUrl: './invitation.page.html',
  styleUrls: ['./invitation.page.scss'],
  standalone: true,
  imports: [IonSpinner, IonContent, CommonModule, FormsModule, PageHeaderComponent, CustomButtonComponent]
})
export class InvitationPage implements OnInit {

  status: 'loading' | 'success' | 'error' = 'loading';
  inviteLink: string | null = null;
  inviteCode: string | null = null;
  qrUrl: string | null = null;

  invitations: Invitations[] = [
    {
      id: '1',
      name: 'Jean Dupont',
      photoUrl: 'https://randomuser.me/api/portraits/men/1.jpg',
      date: new Date(),
    },
    {
      id: '2',
      name: 'Marie Curie',
      photoUrl: 'https://randomuser.me/api/portraits/women/1.jpg',
      date: new Date(),
    },
  ];

  constructor(private route: ActivatedRoute,
    private router: Router,
    private tontineService: TontineService,
    private modalCtrl: ModalController,
  ) { }

  ngOnInit() {
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
        inviteLink: this.inviteLink,
      },
      breakpoints: [0, 0.6, 0.9],
      initialBreakpoint: 0.6,
      backdropDismiss: true,
      cssClass: 'panel-modal',
    });
    await modal.present();
  }

  openMemberProfile(memberId: string): void {
    const tontineId = this.route.snapshot.paramMap.get('id');
    if (tontineId) {
      this.router.navigate(['/tontines', tontineId, memberId, 'member-profile']);
    }
  }

}



