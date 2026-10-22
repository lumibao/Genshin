/**
 * Chapter IV — The Celestial Trial.
 *
 * A night observatory above the clouds: three star mechanisms, a genuinely
 * solvable constellation sequence, a glowing lens, and a warden who has been
 * waiting a very long time.
 */
import * as THREE from 'three';
import { BaseWorld } from './BaseWorld.js';
import {
  createClouds,
  createConstellation,
  createParticleField,
  createPedestal,
  createPillar,
  createRuneCircle,
  createSky,
  createTorch,
  createWaystone,
  markShadows,
} from './WorldKit.js';
import { createNPCModel, createQuestMarker } from './NPCKit.js';
import { stoneTexture } from '../game/Textures.js';
import { BARKS } from '../story/storyData.js';

const TRACE_SEQUENCE = [0, 2, 1, 3];

export class CelestialObservatory extends BaseWorld {
  constructor(context) {
    super(context);
    this.level = 4;
    this.surface = 'stone';
    this.music = 'observatory';
    this.ambience = 'observatory';
    this.atmosphere = {
      fog: '#0d1424',
      fogNear: 40,
      fogFar: 180,
      background: '#070b16',
    };
    this.bounds = { x: 0, z: 0, radius: 19 };
    this.spawns = {
      default: { x: 0, z: 13, yaw: Math.PI },
      fromArchive: { x: 0, z: 13, yaw: Math.PI },
    };
    this.starsLit = Number(context.game.state.flags.L4_stars) || 0;
    this.traceStep = 0;
    this.traceFailures = Number(context.game.state.flags.L4_traceFailures) || 0;
    this.solved = !!context.game.state.flags.L4_constellationSolved;
    this.mechanisms = [];
    this.pylons = [];
  }

  heightAt(x, z) {
    // Flat observatory deck with a raised rim.
    const dist = Math.hypot(x, z);
    if (dist < 15.5) return 0;
    if (dist < 19) return (dist - 15.5) * 0.28;
    return 4 + (dist - 19) * 0.8;
  }

  async build() {
    this._buildSky();
    this._buildLights();
    this._buildPlatform();
    this._buildStarMechanisms();
    this._buildLens();
    this._buildConstellation();
    this._buildWarden();
    this._buildPortals();
    this._buildAmbience();

    if (this.starsLit >= 3) this._beginTrace(true);
    if (this.solved) this._restoreSolved();
  }

  _buildSky() {
    this.sky = createSky({
      top: '#060b1a',
      horizon: '#1e3350',
      bottom: '#0a1120',
      sunColor: '#dfe8ff',
      sunDir: [-0.35, 0.5, -0.7],
      stars: 1.4,
      exponent: 1.5,
      radius: 320,
    });
    this.group.add(this.sky);
    this.addUpdate(this.sky.userData.update);

    // Moon.
    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this._makeMoonTexture(),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    moon.position.set(-90, 76, -190);
    moon.scale.set(44, 44, 1);
    this.group.add(moon);

    // The distant celestial structure: nested slowly turning rings.
    const orrery = new THREE.Group();
    orrery.position.set(46, 38, -150);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#bcd2f0',
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(12 + i * 5, 0.24, 4, 64), ringMat);
      ring.rotation.set(i * 0.8, i * 0.5, i * 0.3);
      orrery.add(ring);
    }
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this._makeMoonTexture(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    core.scale.set(12, 12, 1);
    orrery.add(core);
    this.group.add(orrery);
    this.addUpdate((dt) => {
      orrery.rotation.y += dt * 0.02;
      orrery.children.forEach((child, i) => {
        if (child.isMesh) child.rotation.z += dt * 0.03 * (i + 1);
      });
    });

    // Clouds below the observatory to sell the altitude.
    this.lowClouds = createClouds({
      count: 16,
      radius: 120,
      height: -18,
      scale: 60,
      seed: 63,
      opacity: 0.36,
      color: '#c6d7ef',
    });
    this.group.add(this.lowClouds);
    this.addUpdate(this.lowClouds.userData.update);

    this.highClouds = createClouds({
      count: 6,
      radius: 150,
      height: 55,
      scale: 40,
      seed: 67,
      opacity: 0.14,
      color: '#9fb8dc',
    });
    this.group.add(this.highClouds);
    this.addUpdate(this.highClouds.userData.update);
  }

  _makeMoonTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(214,230,255,0.95)');
    g.addColorStop(0.5, 'rgba(150,190,240,0.35)');
    g.addColorStop(1, 'rgba(80,120,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  _buildLights() {
    this.group.add(new THREE.HemisphereLight('#7f9ccb', '#242a33', 0.85));

    const moonLight = new THREE.DirectionalLight('#cdddf8', 1.5);
    moonLight.position.set(-40, 60, -50);
    this.group.add(moonLight);

    const rim = new THREE.DirectionalLight('#8fb4e8', 0.55);
    rim.position.set(30, 20, 40);
    this.group.add(rim);

    this.group.add(new THREE.AmbientLight('#5a6a88', 0.35));
  }

  _buildPlatform() {
    const stone = new THREE.MeshStandardMaterial({
      map: stoneTexture('dark'),
      color: '#8a8d96',
      roughness: 0.95,
    });

    const deck = new THREE.Mesh(new THREE.CylinderGeometry(16, 16.8, 0.8, 40), stone);
    deck.position.y = -0.4;
    deck.receiveShadow = true;
    this.group.add(deck);

    // Inlaid rune circle in the deck.
    const inlay = createRuneCircle({ color: '#b9cfef', radius: 9, opacity: 0.22 });
    inlay.position.y = 0.05;
    this.group.add(inlay);
    this.addUpdate(inlay.userData.update);

    // Rim wall segments with gaps.
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      if (angle > 1.15 && angle < 1.95) continue; // gap for the entrance stair
      const seg = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.5), stone);
      seg.position.set(Math.cos(angle) * 16.1, 0.45, Math.sin(angle) * 16.1);
      seg.rotation.y = -angle + Math.PI / 2;
      seg.castShadow = true;
      seg.receiveShadow = true;
      this.group.add(seg);
    }

    // Entry stairs.
    for (let i = 0; i < 5; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.22, 1), stone);
      step.position.set(0, -0.1 - i * 0.22, 16.6 + i);
      this.group.add(step);
    }
    this.addColliderBox(0, 17.6, 2.2, 0.6);

    // Pillars with braziers.
    const positions = [
      [-11, 6],
      [11, 6],
      [-7, -9],
      [7, -9],
    ];
    positions.forEach(([x, z], i) => {
      const pillar = createPillar({ height: 5.4, radius: 0.5, broken: false, seed: i + 3 });
      this.add(pillar, { x, z, y: 0, camera: true });
      this.addColliderCircle(x, z, 0.65);
      const brazier = createTorch({ height: 5.9, withLight: i === 0 || i === 3, tint: '#9fc4ff' });
      this.add(brazier, { x, z, y: 0, castShadow: false });
      this.addUpdate(brazier.userData.update);
    });

    // A star chart lectern.
    const chartGroup = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#6a6f7a', metalness: 0.7, roughness: 0.45 });
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, 1.3, 6), metal);
    stand.position.y = 0.65;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.0), metal);
    plate.position.y = 1.32;
    plate.rotation.x = -0.3;
    chartGroup.add(stand, plate);
    markShadows(chartGroup);
    this.add(chartGroup, { x: -4.6, z: 10.5, y: 0 });
    this.addColliderCircle(-4.6, 10.5, 0.5);
    this.addInteractable({
      id: 'star-chart',
      x: -4.6,
      z: 10.5,
      y: 1.5,
      radius: 2.4,
      prompt: 'Read the annotated star chart',
      glyph: '✎',
      action: () => this.game.openLore('observatoryChart'),
    });
  }

  _buildStarMechanisms() {
    const specs = [
      { x: -8.5, z: 1.5 },
      { x: 0, z: -8.5 },
      { x: 8.5, z: 1.5 },
    ];
    specs.forEach((spec, index) => {
      const group = new THREE.Group();
      const baseMat = new THREE.MeshStandardMaterial({ map: stoneTexture('dark'), color: '#9a9aa4', roughness: 0.9 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.4, 8), baseMat);
      base.position.y = 0.2;
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34, 0),
        new THREE.MeshStandardMaterial({
          color: '#5d6470',
          emissive: '#bcd4f6',
          emissiveIntensity: 0,
          metalness: 0.4,
          roughness: 0.25,
        }),
      );
      star.position.y = 1.5;
      star.scale.y = 1.5;
      group.add(base, star);
      group.position.set(spec.x, 0, spec.z);
      this.group.add(group);
      this.addUpdate((dt, time) => {
        star.rotation.y += dt * (0.35 + group.userData.lit * 1.4);
        star.position.y = 1.5 + Math.sin(time * 1.4 + index) * 0.05;
      });
      group.userData.lit = 0;
      group.userData.setLit = (value) => {
        group.userData.lit = value ? 1 : 0;
        star.material.emissiveIntensity = value ? 2.8 : 0;
        star.material.color.set(value ? '#cfe2ff' : '#5d6470');
      };
      this.addColliderCircle(spec.x, spec.z, 0.8);
      this.mechanisms.push(group);

      const lit = this.starsLit > index;
      group.userData.setLit(lit);

      this.addInteractable({
        id: `star-mechanism-${index}`,
        x: spec.x,
        z: spec.z,
        y: 1.6,
        radius: 2.5,
        prompt: 'Light the star mechanism',
        glyph: '✧',
        action: () => this._lightStar(index),
      });
    });
  }

  _lightStar(index) {
    if (index < this.starsLit) {
      this.game.hud.toast({ icon: '✧', text: 'This star is already burning.', variant: 'hint' });
      return;
    }
    if (index !== this.starsLit) {
      this.game.hud.toast({ icon: '✧', text: 'The stars must wake one at a time.', variant: 'hint' });
      return;
    }
    this.starsLit++;
    this.mechanisms[index].userData.setLit(true);
    this.game.audio.play('mechanism');
    this.game.cinematics.flashScreen('#e6efff', 420);
    this.game.quests.setFlag('L4_stars', this.starsLit);
    this.game.hud.toast({
      icon: '✧',
      text: `${this.starsLit} of 3 star mechanisms lit.`,
      variant: 'hint',
    });
    if (this.starsLit >= 3) this._beginTrace();
  }

  _buildLens() {
    const lens = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ map: stoneTexture('dark'), color: '#8b8f9b', roughness: 0.85 });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.5, 16), metal);
    drum.position.y = 0.25;
    lens.add(drum);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.0, 0.16, 8, 40),
      new THREE.MeshStandardMaterial({ color: '#aab4c8', metalness: 0.85, roughness: 0.3 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.55;
    lens.add(ring);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.9, 40),
      new THREE.MeshStandardMaterial({
        color: '#20304a',
        emissive: '#5f8fc0',
        emissiveIntensity: 0.6,
        metalness: 0.6,
        roughness: 0.15,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.56;
    lens.add(disc);

    // Turning lens arms.
    const arms = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 0.12), metal);
      arm.rotation.y = (i / 3) * Math.PI;
      arm.position.y = 0.68;
      arms.add(arm);
    }
    lens.add(arms);
    this.lens = lens;

    this.add(lens, { x: 0, z: 0, y: 0, camera: true });
    this.addColliderCircle(0, 0, 2.6);
    this.addUpdate((dt) => {
      arms.rotation.y += dt * 0.12;
    });

    // Seal that appears above the lens once the constellation is traced.
    const seal = new THREE.Group();
    const sealRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.05, 6, 28),
      new THREE.MeshStandardMaterial({ color: '#d9c9f2', emissive: '#9f7fd8', emissiveIntensity: 1.6, metalness: 0.8, roughness: 0.25 }),
    );
    seal.add(sealRing);
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      new THREE.MeshStandardMaterial({ color: '#efe6ff', emissive: '#b49cff', emissiveIntensity: 2.2, roughness: 0.2 }),
    );
    seal.add(core);
    seal.position.set(0, 2.4, 0);
    seal.visible = false;
    this.group.add(seal);
    this._seal = seal;
    this._sealCore = core;
    this._sealRing = sealRing;
    this.addUpdate((dt, time) => {
      if (!seal.visible) return;
      seal.rotation.y += dt * 0.6;
      seal.position.y = 2.4 + Math.sin(time * 1.3) * 0.12;
      sealRing.rotation.z += dt * 0.4;
    });

    const sealLight = new THREE.PointLight('#c4a8ff', 0, 8, 2);
    sealLight.position.set(0, 2.4, 0);
    this.group.add(sealLight);
    this._sealLight = sealLight;

    this.addInteractable({
      id: 'celestial-seal',
      x: 0,
      z: 0,
      y: 2.4,
      radius: 3.0,
      prompt: 'Claim the final seal fragment',
      glyph: '☾',
      action: () => this._claimSeal(),
      enabled: () => this.solved && !this.game.state.flags.L4_seal,
    });
  }

  _buildConstellation() {
    const points = [
      [-11, 26, -32],
      [-4, 31, -38],
      [5, 30, -37],
      [12, 25, -31],
    ];
    this._constellation = createConstellation({
      points,
      color: '#f4e9c4',
      lineColor: '#a9c7f0',
      pointSize: 2.6,
    });
    this.group.add(this._constellation);
    this._constellation.userData.setOpacity(0);

    // Sequenced halo that shows the order.
    this._traceHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this._makeMoonTexture(),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: '#ffe6b0',
      }),
    );
    this._traceHalo.scale.set(4, 4, 1);
    this._traceHalo.visible = false;
    this.group.add(this._traceHalo);

    this._tracePulseIndex = 0;
    this._tracePulseTimer = 0;
    this.addUpdate((dt) => {
      if (!this._traceActive || this.solved) return;
      this._tracePulseTimer += dt;
      const step = Math.floor(this._tracePulseTimer / 0.95) % TRACE_SEQUENCE.length;
      const visible = this._tracePulseTimer % 0.95 < 0.55;
      const idx = TRACE_SEQUENCE[step];
      const p = points[idx];
      this._traceHalo.visible = visible;
      this._traceHalo.position.set(p[0], p[1], p[2]);
      this._traceHalo.material.opacity = visible ? 0.8 : 0;
    });
  }

  _beginTrace(instant = false) {
    if (this.solved) return;
    this._traceActive = true;
    this._constellation.userData.setOpacity(0.95);
    if (!instant) {
      this.game.hud.showPuzzlePanel?.('Trace the Constellation', 4);
      this.game.hud.setPuzzleProgress?.(0, 0);
      this.game.hud.toast({
        icon: '✦',
        kicker: 'The Sky Answers',
        text: 'Watch the constellation. Its stars kindle in order — then touch the star pylons in that same order.',
        variant: 'quest',
      });
      this.game.audio.play('unlock');
    } else {
      this.game.hud.showPuzzlePanel?.('Trace the Constellation', 4);
      this.game.hud.setPuzzleProgress?.(this.traceStep, Math.min(3, this.traceStep));
    }
    this._buildPylons();
  }

  _buildPylons() {
    if (this.pylons.length) return;
    const positions = [
      [-9, -3],
      [-3, -11],
      [3, -11],
      [9, -3],
    ];
    const colors = ['#f4e9c4', '#cfe2ff', '#e2d0ff', '#c9f0e6'];
    positions.forEach(([x, z], i) => {
      const pylon = new THREE.Group();
      const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTexture('dark'), color: '#8f93a0', roughness: 0.9 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.4, 1.9, 6), stoneMat);
      shaft.position.y = 0.95;
      pylon.add(shaft);
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.2, 0),
        new THREE.MeshStandardMaterial({
          color: colors[i],
          emissive: colors[i],
          emissiveIntensity: 1.2,
          roughness: 0.25,
        }),
      );
      star.position.y = 2.1;
      pylon.add(star);
      pylon.position.set(x, 0, z);
      this.group.add(pylon);
      this.addColliderCircle(x, z, 0.55);
      this.pylons.push(pylon);
      this.addUpdate((dt, time) => {
        star.rotation.y += dt * 0.5;
        star.position.y = 2.1 + Math.sin(time * 1.5 + i) * 0.05;
      });

      this.addInteractable({
        id: `star-pylon-${i}`,
        x,
        z,
        y: 2.1,
        radius: 2.2,
        prompt: 'Touch the star pylon',
        glyph: '✦',
        action: () => this._traceInput(i),
      });
    });
  }

  _traceInput(index) {
    if (this.solved) return;
    if (!this._traceActive) {
      this.game.hud.toast({ icon: '✦', text: 'The pylons are dark. Wake the three star mechanisms first.', variant: 'hint' });
      return;
    }
    if (index === TRACE_SEQUENCE[this.traceStep]) {
      this.traceStep++;
      this.game.audio.play('mechanism');
      this.game.cinematics.flashScreen('#e8f0ff', 240);
      this.game.hud.setPuzzleProgress?.(this.traceStep, Math.min(3, this.traceStep));
      if (this.traceStep >= TRACE_SEQUENCE.length) {
        this._solveConstellation();
      } else {
        this.game.hud.toast({ icon: '✦', text: 'The constellation holds. Keep tracing.', variant: 'hint' });
      }
      return;
    }

    // Wrong pylon.
    this.traceStep = 0;
    this.traceFailures++;
    this.game.quests.setFlag('L4_traceFailures', this.traceFailures);
    this.game.hud.setPuzzleProgress?.(0, 0);
    this.game.audio.play('puzzleFail');
    this.game.cameraController.shake(0.1, 0.35);
    this.game.hud.toast({ icon: '✕', text: 'The lines scatter. Watch the order again.', variant: 'hint' });
    if (this.traceFailures === 2) {
      this.game.hud.toast({
        icon: '✎',
        text: 'Hint — the first star to kindle is the leftmost, then the third, then the second, then the rightmost.',
        variant: 'hint',
      });
    }
  }

  _solveConstellation() {
    this.solved = true;
    this._traceActive = false;
    this.game.quests.setFlag('L4_constellationSolved', true);
    this.game.hud.hidePuzzlePanel?.();
    this.game.audio.play('unlock');
    this.game.cinematics.flashScreen('#dfe9ff', 900);
    this.game.cameraController.shake(0.18, 0.8);
    this._traceHalo.visible = false;
    this._constellation.userData.setOpacity(1);
    this.game.hud.toast({
      icon: '✦',
      kicker: 'Constellation Complete',
      text: 'The lens draws the sky into itself. A seal forms above it.',
      variant: 'quest',
    });
    this._seal.visible = true;
    this._sealLight.intensity = 5;
  }

  _claimSeal() {
    if (!this.solved || this.game.state.flags.L4_seal) return;
    this._seal.visible = false;
    this._sealLight.intensity = 0;
    this.game.quests.setFlag('L4_seal', true);
    this.game.inventory.add('celestialSeal', 1);
    this.game.audio.play('fragment');
    this.game.cinematics.flashScreen('#e8dcff', 700);
    this.game.hud.toast({
      icon: '☾',
      kicker: 'The Final Seal',
      text: 'The Celestial Seal is yours.',
      detail: 'Return to the archive beneath the ruins.',
      variant: 'item',
    });
    this._returnGate?.userData.setActive(true);
  }

  _buildWarden() {
    const warden = createNPCModel({
      robeColor: '#3e4a63',
      trimColor: '#b9c6e0',
      hairColor: '#dfe6f4',
      skinColor: '#e2e8f0',
      hood: true,
      staff: true,
      tall: 1.06,
      seed: 18,
    });
    warden.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.emissive = new THREE.Color('#4b6a96');
        child.material.emissiveIntensity = 0.28;
      }
    });
    this.add(warden, { x: 5.6, z: 10.6, rotation: -0.5 });
    this.addUpdate(warden.userData.update);
    const marker = createQuestMarker({ color: '#c6d8f6', offsetY: 2.3 });
    warden.add(marker);
    this.addUpdate(marker.userData.update);
    this._wardenMarker = marker;
    this.addColliderCircle(5.6, 10.6, 0.5);

    this.addInteractable({
      id: 'warden',
      x: 5.6,
      z: 10.6,
      y: 1.4,
      radius: 3,
      prompt: 'Speak with the Astral Warden',
      glyph: '☾',
      action: () => this._talkToWarden(),
      marker: 'npc',
    });
  }

  async _talkToWarden() {
    if (this.game.state.flags.L4_seal) {
      await this.game.dialogue.play('warden.after');
      return;
    }
    if (this.solved) {
      await this.game.dialogue.play('warden.after');
      return;
    }
    if (this.game.state.flags.L4_arrived) {
      if (this.starsLit >= 3) {
        await this.game.dialogue.play('warden.hint');
      } else {
        await this.game.dialogue.play('warden.first');
      }
      this._wardenMarker?.userData.setVisible(false);
      return;
    }
    await this.game.dialogue.play('warden.first');
  }

  _buildPortals() {
    const returnGate = createWaystone({ color: '#b9c8e4', height: 2.4, label: 'Archive Waystone' });
    this.add(returnGate, { x: -6.5, z: 12.6, y: 0 });
    this.addUpdate(returnGate.userData.update);
    this.addColliderCircle(-6.5, 12.6, 0.8);
    this._returnGate = returnGate;
    returnGate.userData.setActive(!!this.game.state.flags.L4_seal);

    this.addInteractable({
      id: 'return-archive',
      x: -6.5,
      z: 12.6,
      y: 2.6,
      radius: 3,
      prompt: () => (this.game.state.flags.L4_seal ? 'Return to the sealed archive' : 'Touch the silent waystone'),
      glyph: '↩',
      action: () => {
        if (!this.game.state.flags.L4_seal) {
          this.game.hud.toast({ icon: '☾', text: BARKS.observatoryLocked, variant: 'hint' });
          this.game.audio.play('locked');
          return;
        }
        this.game.levels.requestTravel('archive', 'fromObservatory', { level: 3 });
      },
    });
  }

  _buildAmbience() {
    const motes = createParticleField({
      count: this.game.renderer.isMobile ? 110 : 220,
      area: 34,
      height: 14,
      center: [0, 0, 0],
      color: '#d6e6ff',
      size: 1.5,
      speed: 0.14,
      drift: 0.7,
      swirl: 0.5,
      opacity: 0.7,
    });
    this.group.add(motes);
    this.addUpdate(motes.userData.update);

    // Shooting star, occasionally.
    const shooting = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this._makeMoonTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: '#ffffff',
      }),
    );
    shooting.scale.set(6, 1.2, 1);
    this.group.add(shooting);
    let timer = 4;
    this.addUpdate((dt, time) => {
      timer -= dt;
      if (timer <= 0) {
        timer = 9 + Math.random() * 12;
        const angle = Math.random() * Math.PI * 2;
        shooting.position.set(Math.cos(angle) * 120, 60 + Math.random() * 30, Math.sin(angle) * 120);
        shooting.material.opacity = 0.9;
        shooting.rotation.z = -0.4;
      }
      if (shooting.material.opacity > 0) {
        shooting.material.opacity -= dt * 0.4;
        shooting.position.y -= dt * 12;
      }
    });
  }

  _restoreSolved() {
    this.mechanisms.forEach((m) => m.userData.setLit(true));
    this._traceActive = false;
    this._constellation.userData.setOpacity(1);
    this.game.hud.hidePuzzlePanel?.();
    this._buildPylons();
    if (!this.game.state.flags.L4_seal) {
      this._seal.visible = true;
      this._sealLight.intensity = 5;
    }
  }

  onLevelComplete(levelId) {
    if (levelId === 4) {
      this.game.hud.toast({
        icon: '☾',
        kicker: 'The Archive Stirs',
        text: 'Something below the archive has begun to unlock.',
        variant: 'quest',
      });
    }
  }
}
