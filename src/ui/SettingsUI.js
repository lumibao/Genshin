/**
 * Settings and the in-game pause menu.
 * All options apply immediately; audio and quality changes are shared with the
 * title screen version of the same panel.
 */
import { Modal } from './Modal.js';

export class SettingsUI {
  constructor(game) {
    this.game = game;
    this.modal = new Modal(game);
  }

  open({ fromTitle = false, returnToPause = false } = {}) {
    if (this.modal.isOpen) return;
    this._returnToPause = returnToPause;
    const settings = this.game.settings;
    const wrap = document.createElement('div');

    /* ---------------- Audio ---------------- */
    const audioSection = document.createElement('div');
    audioSection.className = 'settings-section';
    audioSection.innerHTML = '<h3>Audio</h3>';
    audioSection.append(
      this._slider('Music', 'Original score and reveal theme', settings.music, (value) => {
        this.game.settings.music = value;
        this.game.audio.setVolumes(this.game.settings);
      }),
      this._slider('Ambience', 'Wind, birds, water and caves', settings.ambient, (value) => {
        this.game.settings.ambient = value;
        this.game.audio.setVolumes(this.game.settings);
      }),
      this._slider('Effects', 'Footsteps, mechanisms and pages', settings.sfx, (value) => {
        this.game.settings.sfx = value;
        this.game.audio.setVolumes(this.game.settings);
      }),
      this._toggle('Mute everything', 'Silence the whole game', settings.muted, (value) => {
        this.game.settings.muted = value;
        this.game.audio.setVolumes(this.game.settings);
        this.game.hud.updateSoundButton();
      }),
    );
    wrap.appendChild(audioSection);

    /* ---------------- Controls ---------------- */
    const controlsSection = document.createElement('div');
    controlsSection.className = 'settings-section';
    controlsSection.innerHTML = '<h3>Controls</h3>';
    controlsSection.append(
      this._slider('Look sensitivity', 'Mouse and touch drag', settings.sensitivity / 2, (value) => {
        this.game.settings.sensitivity = Math.max(0.35, value * 2);
        this.game.input.setSensitivity(this.game.settings.sensitivity);
      }),
      this._toggle('Invert vertical look', 'For inverted mouse or swipe', settings.invertY, (value) => {
        this.game.settings.invertY = value;
        this.game.input.invertY = value;
      }),
      this._toggle('Show hints', 'Objective hints in the tracker', settings.hints, (value) => {
        this.game.settings.hints = value;
        this.game.quests.refresh();
      }),
      this._toggle('Show minimap', 'Compass and nearby markers', settings.minimap, (value) => {
        this.game.settings.minimap = value;
      }),
    );
    wrap.appendChild(controlsSection);

    /* ---------------- Display ---------------- */
    const displaySection = document.createElement('div');
    displaySection.className = 'settings-section';
    displaySection.innerHTML = '<h3>Display</h3>';

    const qualityRow = document.createElement('div');
    qualityRow.className = 'setting-row';
    const qualityLabel = document.createElement('span');
    qualityLabel.className = 'setting-label';
    qualityLabel.innerHTML = 'Graphics<small>Lower this if the game stutters</small>';
    const segmented = document.createElement('div');
    segmented.className = 'segmented';
    for (const [value, label] of [
      ['auto', 'Auto'],
      ['high', 'High'],
      ['low', 'Performance'],
    ]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.classList.toggle('is-active', settings.quality === value);
      btn.addEventListener('click', () => {
        this.game.settings.quality = value;
        segmented.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
        this.game.renderer.applyQuality();
        this.game.cameraController.resize();
        this.game.saveSettings();
      });
      segmented.appendChild(btn);
    }
    qualityRow.append(qualityLabel, segmented);
    displaySection.appendChild(qualityRow);

    displaySection.append(
      this._toggle('Reduced motion', 'Calmer camera and interface motion', settings.reducedMotion, (value) => {
        this.game.settings.reducedMotion = value;
        document.body.classList.toggle('reduced-motion', value);
        this.game.cameraController.cinematicDampScale = value ? 0.6 : 1;
      }),
      this._toggle('Fullscreen', 'Hide browser chrome where supported', !!document.fullscreenElement, () => {
        this.game.toggleFullscreen();
      }),
    );
    wrap.appendChild(displaySection);

    /* ---------------- Accessibility / recovery ---------------- */
    const helpSection = document.createElement('div');
    helpSection.className = 'settings-section';
    helpSection.innerHTML = '<h3>Help & Recovery</h3>';
    const helpActions = document.createElement('div');
    helpActions.className = 'settings-actions';

    const controlsBtn = document.createElement('button');
    controlsBtn.type = 'button';
    controlsBtn.className = 'btn btn-ghost';
    controlsBtn.textContent = 'Controls';
    controlsBtn.addEventListener('click', () => this.showControls({ returnToPause: this._returnToPause }));

    const safeBtn = document.createElement('button');
    safeBtn.type = 'button';
    safeBtn.className = 'btn btn-ghost';
    safeBtn.textContent = 'Return to safe point';
    safeBtn.addEventListener('click', () => {
      this.modal.close();
      this.game.returnToSafePoint();
    });

    helpActions.append(controlsBtn, safeBtn);
    helpSection.appendChild(helpActions);
    wrap.appendChild(helpSection);

    const actions = [{ label: fromTitle ? 'Back' : 'Resume', variant: 'primary' }];
    if (!fromTitle && this.game.saveManager.hasState()) {
      actions.push({
        label: 'Reset progress',
        variant: 'danger',
        close: true,
        onClick: () => this.game.confirmResetProgress(),
      });
    }

    this.modal.open({
      title: 'Settings',
      subtitle: 'Shape the journey to your liking',
      body: wrap,
      actions,
      onClose: () => {
        this.game.saveSettings();
        if (this._returnToPause) {
          this._returnToPause = false;
          this.game.returnToPause?.();
        }
      },
    });
  }

  _slider(label, sublabel, value, onInput) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = `<span class="setting-label">${label}<small>${sublabel}</small></span>`;
    const wrap = document.createElement('div');
    wrap.className = 'range-wrap';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(value * 100));
    input.setAttribute('aria-label', label);
    const readout = document.createElement('span');
    readout.className = 'range-value';
    readout.textContent = `${input.value}%`;
    input.addEventListener('input', () => {
      readout.textContent = `${input.value}%`;
      onInput(Number(input.value) / 100);
    });
    wrap.append(input, readout);
    row.appendChild(wrap);
    return row;
  }

  _toggle(label, sublabel, checked, onChange) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = `<span class="setting-label">${label}<small>${sublabel}</small></span>`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toggle';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', String(!!checked));
    button.setAttribute('aria-label', label);
    button.addEventListener('click', () => {
      const next = button.getAttribute('aria-checked') !== 'true';
      button.setAttribute('aria-checked', String(next));
      onChange(next);
      this.game.saveSettings();
    });
    row.appendChild(button);
    return row;
  }

  showControls({ returnToPause = false } = {}) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="settings-section">
        <h3>Desktop</h3>
        <div class="setting-row"><span class="setting-label">Move<small>WASD or arrow keys</small></span><span class="range-value" style="width:auto">WASD</span></div>
        <div class="setting-row"><span class="setting-label">Look<small>Click the world to capture the cursor, or drag</small></span><span class="range-value" style="width:auto">Mouse</span></div>
        <div class="setting-row"><span class="setting-label">Interact<small>When a prompt appears</small></span><span class="range-value" style="width:auto">E</span></div>
        <div class="setting-row"><span class="setting-label">Jump<small>Uses a little stamina</small></span><span class="range-value" style="width:auto">Space</span></div>
        <div class="setting-row"><span class="setting-label">Sprint<small>Hold while moving</small></span><span class="range-value" style="width:auto">Shift</span></div>
        <div class="setting-row"><span class="setting-label">Satchel / Journal<small>Quest items and chapters</small></span><span class="range-value" style="width:auto">I / J</span></div>
        <div class="setting-row"><span class="setting-label">Ledger &amp; wishes<small>Shop, wishing star and your look</small></span><span class="range-value" style="width:auto">B</span></div>
        <div class="setting-row"><span class="setting-label">Zoom<small>Pull the camera in for a closer look</small></span><span class="range-value" style="width:auto">Wheel</span></div>
        <div class="setting-row"><span class="setting-label">Pause<small>Settings, the mirror and recovery</small></span><span class="range-value" style="width:auto">Esc</span></div>
      </div>
      <div class="settings-section">
        <h3>Touch</h3>
        <div class="setting-row"><span class="setting-label">Move<small>Left thumb joystick</small></span><span class="range-value" style="width:auto">◉</span></div>
        <div class="setting-row"><span class="setting-label">Look<small>Swipe the right side of the screen</small></span><span class="range-value" style="width:auto">☞</span></div>
        <div class="setting-row"><span class="setting-label">Interact / Jump<small>Buttons at the lower right</small></span><span class="range-value" style="width:auto">✦ ↑</span></div>
        <div class="setting-row"><span class="setting-label">Zoom<small>Pinch with two fingers on the look area</small></span><span class="range-value" style="width:auto">⇱ ⇲</span></div>
        <div class="setting-row"><span class="setting-label">Mirror<small>Pause → Look at the traveler: drag to turn, pinch to zoom</small></span><span class="range-value" style="width:auto">◎</span></div>
      </div>
      <div class="settings-section">
        <h3>If something goes wrong</h3>
        <p class="confirm-message">Open the pause menu and choose <strong>Return to safe point</strong> if you are ever stuck. Progress saves automatically, and closing the tab never erases it.</p>
      </div>
    `;
    this.modal.open({
      title: 'Controls',
      subtitle: 'The same controller on every device',
      body: wrap,
      actions: [{ label: 'Back', variant: 'ghost' }],
      onClose: () => {
        if (returnToPause) this.game.returnToPause?.();
      },
    });
  }
}

export class PauseMenu {
  constructor(game) {
    this.game = game;
    this.modal = new Modal(game);
    // True while the pause modal is being swapped for a panel. Without it, the
    // pause modal's own onClose would resume the game underneath that panel.
    this._handingOff = false;
  }

  /** Close the pause menu, then open a panel that returns here when closed. */
  _openPanel(open) {
    this._handingOff = true;
    this.modal.close();
    open();
  }

  open() {
    if (this.modal.isOpen) return;
    const summary = this.game.quests.summary();
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <p class="pause-progress">
        <strong>${summary.chapter} · ${summary.title}</strong><br>
        ${summary.done} of ${summary.total} objectives complete${
          summary.completed.length ? ` · ${summary.completed.length} chapter${summary.completed.length > 1 ? 's' : ''} finished` : ''
        }
      </p>
    `;

    const actions = document.createElement('div');
    actions.className = 'pause-actions';

    const addAction = (label, handler, variant = '') => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn ${variant || 'btn-ghost'}`;
      button.textContent = label;
      button.addEventListener('click', handler);
      actions.appendChild(button);
    };

    addAction('Resume', () => {
      this.modal.close();
      this.game.resume();
    }, 'btn-primary');
    addAction('Adventure Journal', () => {
      this._openPanel(() => this.game.journalUI.open({ returnToPause: true }));
    });
    addAction('Satchel', () => {
      this._openPanel(() => this.game.inventoryUI.open({ returnToPause: true }));
    });
    addAction("Wanderer's Ledger & Wishing Star", () => {
      this._openPanel(() => this.game.shopUI.open({ returnToPause: true }));
    });
    addAction('Look at the traveler', () => {
      this._openPanel(() => this.game.openCharacterViewer({ returnToPause: true }));
    });
    addAction('Settings', () => {
      this._openPanel(() => this.game.settingsUI.open({ returnToPause: true }));
    });
    addAction('Controls', () => {
      this._openPanel(() => this.game.settingsUI.showControls({ returnToPause: true }));
    });
    addAction('Where the chronicle continues', () => {
      this.modal.close();
      this.game.resumeChronicle?.();
    });
    addAction('Return to safe point', () => {
      this.modal.close();
      this.game.returnToSafePoint();
    });
    addAction('Save & return to title', () => {
      this.game.saveNow();
      this.modal.close();
      this.game.returnToTitle();
    });
    addAction('Reset all progress', () => {
      this.modal.close();
      this.game.confirmResetProgress();
    }, 'btn-danger');

    wrap.appendChild(actions);

    this.modal.open({
      title: 'Paused',
      subtitle: 'The wind will wait',
      body: wrap,
      closable: true,
      onClose: () => {
        if (this._handingOff) {
          this._handingOff = false;
          return;
        }
        this.game.resume();
      },
    });
  }
}
