import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonTextarea,  } from '@ionic/angular/standalone';
import { PageHeaderComponent } from "src/app/shared/ui/page-header/page-header.component";
import { CustomButtonComponent } from "src/app/shared/ui/custom-button/custom-button.component";

@Component({
  selector: 'app-feedback',
  templateUrl: './feedback.page.html',
  styleUrls: ['./feedback.page.scss'],
  standalone: true,
  imports: [ IonTextarea, IonContent, CommonModule, FormsModule, PageHeaderComponent, CustomButtonComponent]
})
export class FeedbackPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
