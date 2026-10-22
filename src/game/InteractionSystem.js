/**
 * Proximity-based world interaction: finds the closest usable object, shows a
 * prompt on the HUD and routes the shared `interact` action to it.
 */
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class InteractionSystem {
  constructor(game) {
    this.game = game;
    this.nearest = null;
    this.cooldown = 0;
    this.promptVisible = false;
    this.lastPromptId = null;
  }

  refresh() {
    // Called when a world changes to clear stale prompts.
    this.nearest = null;
    this.lastPromptId = null;
    this.game.hud?.setPrompt(null);
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const player = this.game.player;
    if (!player || !player.visible || this.game.isInputBlocked()) {
      if (this.nearest) this._setNearest(null);
      return;
    }

    const interactables = this.game.worlds?.interactables || [];
    let best = null;
    let bestScore = Infinity;
    for (const item of interactables) {
      if (!item || item.disabled) continue;
      if (typeof item.enabled === 'function' && !item.enabled()) continue;
      const pos = item.position;
      if (!pos) continue;
      const dx = pos.x - player.position.x;
      const dz = pos.z - player.position.z;
      const dy = (pos.y ?? player.position.y) - player.position.y;
      if (Math.abs(dy) > (item.heightRange || 3.2)) continue;
      const distance = Math.hypot(dx, dz);
      const radius = item.radius || 2.4;
      if (distance > radius) continue;

      // Prefer whatever is in front of the camera/player and closest.
      let facingPenalty = 0;
      if (distance > 0.001) {
        const forward = this.game.cameraController.getForward();
        const dot = (dx / distance) * forward.x + (dz / distance) * forward.z;
        facingPenalty = dot < -0.25 ? 2.2 : (1 - dot) * 0.55;
      }
      const score = distance + facingPenalty;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }

    if (best !== this.nearest) this._setNearest(best);

    if (this.nearest && this.game.input.consumePress('interact') && this.cooldown <= 0) {
      this.activate(this.nearest);
    }
  }

  _setNearest(item) {
    this.nearest = item;
    const hud = this.game.hud;
    if (!item) {
      hud?.setPrompt(null);
      this.game.mobile?.setInteractReady(false);
      this.promptVisible = false;
      this.lastPromptId = null;
      return;
    }
    const prompt = {
      key: this.game.renderer.isMobile || this.game.mobile?.active ? '✦' : 'E',
      label: typeof item.prompt === 'function' ? item.prompt() : item.prompt || item.label || 'Interact',
      glyph: item.glyph || '✦',
    };
    hud?.setPrompt(prompt);
    this.game.mobile?.setInteractReady(true);
    this.promptVisible = true;
    if (this.lastPromptId !== item.id) {
      this.lastPromptId = item.id;
      this.game.audio?.play('hover');
    }
  }

  activate(item = this.nearest) {
    if (!item || this.cooldown > 0) return;
    if (typeof item.enabled === 'function' && !item.enabled()) return;
    this.cooldown = 0.32;
    this.game.audio?.play('interact');
    try {
      const result = item.action?.(item);
      if (result && typeof result.catch === 'function') {
        result.catch((err) => console.error('[Interaction] action failed', err));
      }
    } catch (err) {
      console.error('[Interaction] action threw', err);
    }
  }

  /** Used by the HUD prompt when clicking it directly (desktop convenience). */
  activateNearest() {
    this.activate(this.nearest);
  }

  get distanceToPlayer() {
    if (!this.nearest || !this.game.player) return Infinity;
    const p = this.nearest.position;
    return _v.set(p.x, p.y || 0, p.z).distanceTo(this.game.player.position);
  }
}
