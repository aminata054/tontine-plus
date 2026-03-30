import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';

@Component({
  selector: 'app-subscription-list',
  templateUrl: './subscription-list.page.html',
  styleUrls: ['./subscription-list.page.scss'],
  standalone: true,
  imports: [IonContent, IonHeader, IonTitle, IonToolbar, CommonModule, FormsModule]
})
export class SubscriptionListPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
