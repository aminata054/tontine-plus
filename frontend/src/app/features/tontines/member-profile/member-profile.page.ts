  import { Component, OnInit } from '@angular/core';
  import { CommonModule } from '@angular/common';
  import { FormsModule } from '@angular/forms';
  import { IonContent, IonIcon } from '@ionic/angular/standalone';
  import { PageHeaderComponent } from "src/app/shared/ui/page-header/page-header.component";

  @Component({
    selector: 'app-member-profile',
    templateUrl: './member-profile.page.html',
    styleUrls: ['./member-profile.page.scss'],
    standalone: true,
    imports: [IonIcon, IonContent, CommonModule, FormsModule, PageHeaderComponent]
  })
  export class MemberProfilePage implements OnInit {

    member = {
      id: '1',
      name: 'Jean Dupont',
      photoUrl: 'https://randomuser.me/api/portraits/men/1.jpg',
      email: 'jean.dupont@example.com',
      phone: '+33 6 12 34 56 78',
      role: 'Membre',
      joinedDate: new Date('2023-01-15'),
      turnNumber: 3,
      paymentHistory: [
        { date: new Date('2023-02-01'), amount: 100, status: 'Payé' },
        { date: new Date('2023-03-01'), amount: 100, status: 'En attente' },
      ]
    };

    constructor() { }

    ngOnInit() {

    }

  }
