import {
  Component, ViewChild, ElementRef,
  CUSTOM_ELEMENTS_SCHEMA, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, ViewDidEnter } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { StorageService } from '../core/services/storage.service';
import { DotIndicatorComponent } from '../shared/ui/dot-indicator/dot-indicator.component';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, IonContent, DotIndicatorComponent],
  templateUrl: './onboarding.page.html',
  styleUrls: ['./onboarding.page.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class OnboardingPage implements ViewDidEnter {

  @ViewChild('swiper', { static: false }) swiperRef!: ElementRef;
  currentSlide = 0;
  private swiperReady = false;

  slides = [
    {
      title: 'Création',
      description: 'Définissez vos propres règles de gestion de votre tontine',
      image: 'assets/images/onboarding1.svg'
    },
    {
      title: 'Partage sécurisé',
      description: 'Partagez avec les personnes en qui vous avez confiance',
      image: 'assets/images/onboarding2.svg'
    },
    {
      title: 'Discussion',
      description: 'Discutez, administrez et animez vos tontines',
      image: 'assets/images/onboarding3.svg'
    }
  ];

  constructor(
    private router: Router,
    private storageService: StorageService,
    private ngZone: NgZone
  ) { }

  // ← ionViewDidEnter : la vue est rendue ET visible, swiper est dans le DOM
  ionViewDidEnter() {
    this.initSwiper();
  }

  private initSwiper() {
    const swiperEl = this.swiperRef?.nativeElement;

    if (!swiperEl) {
      console.warn('swiperRef non disponible');
      return;
    }

    // Vérifier que c'est bien un web component swiper avec initialize()
    if (typeof swiperEl.initialize !== 'function') {
      console.warn('initialize() non disponible — swiper/element/bundle non chargé ?');
      return;
    }

    if (this.swiperReady) return; // éviter double init

    Object.assign(swiperEl, {
      slidesPerView: 1,
      speed: 400,
      pagination: false,
    });

    swiperEl.initialize();
    this.swiperReady = true;

    swiperEl.addEventListener('swiperslidechange', (event: any) => {
      this.ngZone.run(() => {
        this.currentSlide = event.detail[0].activeIndex;
      });
    });
  }

  onSkip() {
    this.storageService.setHasSeenOnboarding().then(() => {
      this.router.navigate(['/register'], { replaceUrl: true });
    });
  }

  onNext() {
    if (this.currentSlide < this.slides.length - 1) {
      const swiper = this.swiperRef?.nativeElement?.swiper;
      if (swiper) {
        swiper.slideNext();
      }
    } else {
      this.storageService.setHasSeenOnboarding().then(() => {
        this.router.navigate(['/login'], { replaceUrl: true });
      });
    }
  }
}