import { gameState } from './state.js?v=103';

export class TutorialSystem {
  constructor() {
    this.step = 1;
    this.banner = document.getElementById('tutorial-banner');
    this.badge = document.getElementById('tutorial-step-badge');
    this.text = document.getElementById('tutorial-text');
    const skipBtn = document.getElementById('btn-skip-tutorial');

    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        this.completeTutorial();
      });
    }
    this.refreshBanner();
  }

  onEvent(eventName) {
    if (gameState.persistent.tutorialDone || gameState.persistent.day > 1) {
      this.hide();
      return;
    }

    const v = gameState.runtime.activeVessel;

    if (this.step === 1 && (eventName === 'sector_changed' || eventName === 'noodle_started')) {
      if (gameState.runtime.activeSector === 0 || eventName === 'noodle_started') {
        this.step = 2;
      }
    }
    if (this.step === 2 && v.noodleState && v.broth) {
      this.step = 3;
    }
    if (this.step === 3 && v.toppings.includes('egg') && v.toppings.includes('scallion')) {
      this.step = 4;
    }
    if (this.step === 4 && eventName === 'dish_served') {
      this.step = 5;
    }
    if (this.step === 5 && gameState.runtime.activeSector === 2) {
      this.completeTutorial();
      return;
    }

    this.refreshBanner();
  }

  refreshBanner() {
    this.hide();
  }

  completeTutorial() {
    gameState.persistent.tutorialDone = true;
    gameState.save();
    this.hide();
  }

  hide() {
    if (this.banner) this.banner.hidden = true;
  }
}
