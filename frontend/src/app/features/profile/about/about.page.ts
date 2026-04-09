import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonBackButton } from '@ionic/angular/standalone';
import { PageHeaderComponent } from "src/app/shared/ui/page-header/page-header.component";

@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  standalone: true,
  imports: [IonContent, CommonModule, FormsModule, PageHeaderComponent]
})
export class AboutPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
