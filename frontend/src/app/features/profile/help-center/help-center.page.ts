import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonAccordion, IonItem, IonLabel, IonAccordionGroup } from '@ionic/angular/standalone';
import { PageHeaderComponent } from "src/app/shared/ui/page-header/page-header.component";
import { CustomInputComponent } from "src/app/shared/ui/custom-input/custom-input.component";

@Component({
  selector: 'app-help-center',
  templateUrl: './help-center.page.html',
  styleUrls: ['./help-center.page.scss'],
  standalone: true,
  imports: [IonAccordionGroup, IonLabel, IonItem, IonAccordion, IonContent, CommonModule, FormsModule, PageHeaderComponent, CustomInputComponent]
})
export class HelpCenterPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
