import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent, IonButton, IonIcon, IonSpinner, AlertController, ToastController,
} from '@ionic/angular/standalone';

import { PageHeaderComponent } from "src/app/shared/ui/page-header/page-header.component";
import { CustomButtonComponent } from "src/app/shared/ui/custom-button/custom-button.component";
import { CustomInputComponent } from "src/app/shared/ui/custom-input/custom-input.component";

// Si vous utilisez @capacitor-mlkit/barcode-scanning
// import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

@Component({
  selector: 'app-join',
  templateUrl: './join.page.html',
  styleUrls: ['./join.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonContent, IonButton, IonIcon, IonSpinner,
    PageHeaderComponent,
    CustomButtonComponent,
    CustomInputComponent
  ],
})
export class JoinPage implements OnInit, OnDestroy {

  /** 'scan' | 'link' */
  activeTab: 'scan' | 'link' = 'scan';

  /** Valeur saisie dans le champ lien/code */
  inviteInput = '';

  /** Scan en cours */
  isScanning = false;

  /** Validation du lien en cours */
  isValidating = false;

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
  ) { }

  ngOnInit(): void {
    if (this.activeTab === 'scan') {
      this.startScan();
    }
  }

  ngOnDestroy(): void {
    this.stopScan();
  }

  // ── Onglets ──────────────────────────────────────────────────────────────

  switchTab(tab: 'scan' | 'link'): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;

    if (tab === 'scan') {
      this.startScan();
    } else {
      this.stopScan();
    }
  }

  // ── Scanner QR ───────────────────────────────────────────────────────────

  async startScan(): Promise<void> {
    this.isScanning = true;

    try {
      // ── Avec @capacitor-mlkit/barcode-scanning ──
      // const { barcodes } = await BarcodeScanner.scan({
      //   formats: [BarcodeFormat.QrCode],
      // });
      // if (barcodes.length > 0) {
      //   const raw = barcodes[0].rawValue;
      //   this.handleScannedValue(raw);
      // }

      // ── Simulation (à retirer en prod) ──
      // Remplacez ce bloc par l'implémentation réelle ci-dessus
      console.log('Scanner QR démarré — intégrez @capacitor-mlkit/barcode-scanning');
    } catch (err) {
      this.isScanning = false;
      await this.showError('Impossible d\'accéder à la caméra. Vérifiez les permissions.');
    }
  }

  stopScan(): void {
    this.isScanning = false;
    // BarcodeScanner.stopScan(); // décommentez si vous utilisez mlkit
  }

  /**
   * Appelé quand un QR code est détecté.
   * Extrait le code depuis une URL du type https://tontineplus.app/join/ABC123
   * ou directement un code brut de 6 caractères.
   */
  handleScannedValue(raw: string): void {
    this.stopScan();

    let code = raw.trim().toUpperCase();

    // Si c'est une URL complète, extraire le code
    const match = raw.match(/\/join\/([A-Z0-9]{6,})/i);
    if (match) {
      code = match[1].toUpperCase();
    }

    if (code.length >= 6) {
      this.router.navigate(['tontines/join', code]);
    } else {
      this.showError('QR code invalide. Essayez avec un lien d\'invitation.');
    }
  }

  // ── Saisie manuelle du lien / code ───────────────────────────────────────

  onInputChange(value: string): void {
    this.inviteInput = value ?? '';
  }

  validate(): void {
    const raw = this.inviteInput.trim();
    if (!raw) return;

    let code = '';

    // Cas 1 : URL complète (https://tontineplus.app/join/ABC123)
    const urlMatch = raw.match(/\/join\/([A-Z0-9]{6,})/i);
    if (urlMatch) {
      code = urlMatch[1].toUpperCase();
    } else {
      // Cas 2 : Code brut (ABC123)
      code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    if (code.length < 6) {
      this.showError('Lien ou code invalide. Vérifiez et réessayez.');
      return;
    }

    this.router.navigate(['/join', code]);
  }

  get isInputValid(): boolean {
    return this.inviteInput.trim().length >= 6;
  }

  // ── Erreur ───────────────────────────────────────────────────────────────

  async showError(message: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Erreur !',
      message,
      buttons: ['Fermer'],
      cssClass: 'join-error-alert',
    });
    await alert.present();
  }
}