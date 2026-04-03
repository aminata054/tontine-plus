import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import {
  IonContent,
} from '@ionic/angular/standalone';
import { TontineService } from 'src/app/core/services/tontine.service';
import { StateScreenComponent } from "src/app/shared/ui/state-screen/state-screen.component";
import { PageHeaderComponent } from "src/app/shared/ui/page-header/page-header.component";

@Component({
  selector: 'app-join-state',
  templateUrl: './join-state.page.html',
  styleUrls: ['./join-state.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, StateScreenComponent, PageHeaderComponent],
})
export class JoinStatePage implements OnInit {

  tontineId = '';
  tontineName = '';
  /** true = accepté directement, false = en attente de validation */
  autoAccepted = false;
  cancelling = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private tontineService: TontineService,
  ) { }

  ngOnInit(): void {
    // Les paramètres sont passés via router state
    const nav = this.router.getCurrentNavigation();
    const state = nav?.extras?.state as any;

    this.tontineId = state?.tontineId ?? this.route.snapshot.queryParamMap.get('id') ?? '';
    this.tontineName = state?.tontineName ?? this.route.snapshot.queryParamMap.get('name') ?? 'la tontine';
    this.autoAccepted = state?.autoAccepted ?? false;
  }

  goToTontine(): void {
    this.router.navigate(['/tontines', this.tontineId, 'overview'], { replaceUrl: true });
  }

  goHome(): void {
    this.router.navigate(['/tontines'], { replaceUrl: true });
  }


  onPrimaryAction(): void {
    if (this.autoAccepted) {
      this.goToTontine();
    } else {
      this.cancelRequest();
    }
  }

  onSecondaryAction(): void {
    this.goHome();
  }

  /**
   * Permet à l'utilisateur d'annuler sa demande en attente.
   * (Optionnel — nécessite un endpoint PATCH /tontines/:id/members/:uid/cancel)
   */
  cancelRequest(): void {
    // À implémenter selon votre API
    this.router.navigate(['/tontines'], { replaceUrl: true });
  }

  // _________________________________________________

  // getters

  // _________________________________________________

  get stateType(): any {
    return this.autoAccepted ? 'success' : 'waiting';
  }

  get stateTitle(): string {
    return this.autoAccepted ? 'Bienvenue !' : 'Demande envoyée !';
  }

  get stateSubtitle(): string {
    if (this.autoAccepted) {
      return `Vous avez rejoint <strong>${this.tontineName}</strong> avec succès.<br>Bonne tontine !`;
    }

    return `Votre demande a été envoyée à<br>
          l'administrateur de la tontine.<br>
          Vous serez notifié dès validation.`;
  }

  get primaryButtonText(): string {
    return this.autoAccepted ? 'Voir la tontine' : 'Annuler ma demande';
  }

  get secondaryButtonText(): string {
    return this.autoAccepted ? 'Retour' : 'Retour';
  }

  get secondaryButtonFill(): 'solid' | 'outline' {
    return this.autoAccepted ? 'outline' : 'outline';
  }

  get linkText(): string {
    return ''; // optionnel si tu veux un lien en bas
  }
}