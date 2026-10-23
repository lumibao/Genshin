/**
 * Chapter II, part two — The Fallen Circle.
 *
 * An open-air ruin with a genuine stateful puzzle: three wind mechanisms must
 * be woken in the order carved on the western mural. A portcullis gate lifts
 * when the sequence is correct, revealing the first chronicle fragment and the
 * stair down into the archive.
 *
 * There are exactly three mechanisms — east, north and south. The mural stands
 * on the western wall and is a signpost, not a fourth pillar, so the courtyard
 * floor carries a compass rose and every mechanism carries its own direction
 * letter. A player should never have to hunt for a west that does not exist.
 */
import * as THREE from 'three';
import { BaseWorld } from './BaseWorld.js';
import {
  createClouds,
  createFlower,
  createGrassField,
  createMechanism,
  createParticleField,
  createPedestal,
  createPillar,
  createRock,
  createRuneCircle,
  createSky,
  createTerrain,
  createTorch,
  createWallSegment,
  createWaystone,
  markShadows,
  rng,
  smoothstep,
} from './WorldKit.js';
import { BARKS } from '../story/storyData.js';
import { stoneTexture } from '../game/Textures.js';

const SEQUENCE = ['east', 'north', 'south'];

export class AncientRuins extends BaseWorld {
  constructor(context) {
    super(context);
    this.level = 2;
    this.surface = 'stone';
    this.music = 'ruins';
    this.ambience = 'ruins';
    this.atmosphere = {
      fog: '#9aa89a',
      fogNear: 34,
      fogFar: 130,
      background: '#a8b8a8',
    };
    this.bounds = { x: 0, z: -6, radius: 40 };
    this.spawns = {
      default: { x: 0, z: 11.5, yaw: Math.PI },
      fromWoods: { x: 0, z: 11.5, yaw: Math.PI },
      fromArchive: { x: 0, z: -24, yaw: 0 },
    };
    this.step = 0;
    this.wrongAttempts = 0;
    this.solved = !!context.game.state.flags.L2_puzzleSolved;
    this.mechanisms = {};
    this._gateOpenProgress = 0;
  }

  heightAt(x, z) {
    const base = Math.sin(x * 0.09) * 0.22 + Math.cos(z * 0.08) * 0.2;
    // Level floor inside the courtyard and the inner chamber.
    const inCourtyard = Math.abs(x) < 15 && Math.abs(z) < 15;
    const inChamber = Math.abs(x) < 10 && z < -15 && z > -31;
    if (inCourtyard || inChamber) return base * 0.25;
    const rise = smoothstep(15, 32, Math.abs(x)) * 1.2 + smoothstep(15, 30, -z) * 0.6;
    return base + rise;
  }

  async build() {
    const highQuality = this.game.renderer.tier === 'high';
    this._buildSky();
    this._buildLights(highQuality);
    this._buildGround();
    this._buildCompass();
    this._buildWalls(highQuality);
    this._buildMural();
    this._buildMechanisms();
    this._buildGateAndChamber();
    this._buildDetails();
    this._buildAmbience();

    if (this.solved) {
      this._restoreSolved();
    } else {
      this.game.hud.showPuzzlePanel?.('The Winds Remember', SEQUENCE.length);
      this.game.hud.setPuzzleProgress?.(0, 0);
      this.game.hud.toast({
        icon: '✎',
        text: 'Three mechanisms: east, north, south. Read the mural on the west wall for the order.',
        variant: 'hint',
      });
    }
  }

  _buildSky() {
    this.sky = createSky({
      top: '#527fa0',
      horizon: '#cfd4bd',
      bottom: '#a8b8a8',
      sunColor: '#ffeec8',
      sunDir: [-0.4, 0.55, -0.45],
      exponent: 0.9,
      radius: 270,
    });
    this.group.add(this.sky);
    this.addUpdate(this.sky.userData.update);

    this.clouds = createClouds({ count: 9, radius: 150, height: 50, scale: 40, seed: 51, opacity: 0.55 });
    this.group.add(this.clouds);
    this.addUpdate(this.clouds.userData.update);
  }

  _buildLights(highQuality) {
    this.group.add(new THREE.HemisphereLight('#d6e6ef', '#5a6352', 1.15));

    const sun = new THREE.DirectionalLight('#fff0cd', 2.2);
    sun.position.set(-30, 46, -14);
    if (highQuality) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 110;
      sun.shadow.camera.left = -30;
      sun.shadow.camera.right = 30;
      sun.shadow.camera.top = 30;
      sun.shadow.camera.bottom = -30;
      sun.shadow.bias = -0.0008;
      sun.shadow.normalBias = 0.05;
    }
    this.group.add(sun);
    this.group.add(new THREE.AmbientLight('#b8c8bf', 0.42));
  }

  _buildGround() {
    const terrain = createTerrain({
      size: 120,
      segments: 72,
      heightFn: (x, z) => this.heightAt(x, z),
      palette: ['#6d7f56', '#788a5e', '#5e7150', '#828f63'],
      seed: 61,
    });
    this.group.add(terrain);

    // Stone floor slabs for the courtyard.
    const stone = new THREE.MeshStandardMaterial({
      color: '#b6b6a8',
      roughness: 1,
      map: stoneTexture(),
    });
    const random = rng(17);
    for (let x = -14; x < 14; x += 2.2) {
      for (let z = -14; z < 14; z += 2.2) {
        if (random() > 0.86) continue;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.12, 2.05), stone);
        slab.position.set(x + (random() - 0.5) * 0.2, 0.03, z + (random() - 0.5) * 0.2);
        slab.rotation.y = (random() - 0.5) * 0.05;
        slab.receiveShadow = true;
        this.group.add(slab);
      }
    }

    // Inner chamber floor.
    for (let x = -9; x < 9; x += 2.2) {
      for (let z = -30; z < -15; z += 2.2) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 2.0), stone);
        slab.position.set(x, 0.03, z);
        slab.receiveShadow = true;
        this.group.add(slab);
      }
    }

    // Grass creeping into the ruin.
    const grass = createGrassField({
      count: this.game.renderer.isMobile ? 1800 : 3400,
      radius: 34,
      center: [0, 0],
      heightFn: (x, z) => this.heightAt(x, z),
      filterFn: (x, z) => Math.abs(x) > 15 || Math.abs(z) > 15,
      seed: 91,
      fogColor: this.atmosphere.fog,
      fogNear: this.atmosphere.fogNear,
      fogFar: this.atmosphere.fogFar,
      windStrength: 0.8,
      scaleRange: [0.7, 1.2],
    });
    this.group.add(grass);
    this.addUpdate(grass.userData.update);

    for (let i = 0; i < 40; i++) {
      const angle = random() * Math.PI * 2;
      const dist = 8 + random() * 22;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;
      const flower = createFlower({ color: ['#d9cfae', '#c4cba4'][i % 2], seed: i });
      this.add(flower, { x, z, y: this.heightAt(x, z), castShadow: false, receiveShadow: false });
    }
  }

  /** Flat compass rose on the courtyard floor — the world's own signpost. */
  _buildCompass() {
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: '#9c9a8a', roughness: 1 });
    const inlay = new THREE.MeshStandardMaterial({
      color: '#cfe6da',
      emissive: '#7fb8a8',
      emissiveIntensity: 0.5,
      roughness: 0.6,
    });

    const ring = new THREE.Mesh(new THREE.RingGeometry(2.55, 2.8, 40), stone);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.055;
    ring.receiveShadow = true;
    group.add(ring);

    const inner = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.16, 32), inlay);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.055;
    group.add(inner);

    // Four spokes, with the west spoke pointing at the mural.
    const spokes = [
      [0, -2.8, 0.1, 5.6],
      [0, 2.8, 0.1, 5.6],
      [2.8, 0, 5.6, 0.1],
      [-2.8, 0, 5.6, 0.1],
    ];
    for (const [x, z, w, d] of spokes) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), inlay);
      spoke.position.set(x / 2, 0.05, z / 2);
      group.add(spoke);
    }

    const letters = [
      ['N', 0, -3.5],
      ['S', 0, 3.5],
      ['E', 3.5, 0],
      ['W', -3.5, 0],
    ];
    for (const [letter, x, z] of letters) {
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 1.1),
        new THREE.MeshBasicMaterial({
          map: this._letterTexture(letter),
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
        }),
      );
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(x, 0.07, z);
      group.add(plate);
    }

    // "Mural" tag under the W, so the far wall reads as a signpost.
    const muralTag = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.8),
      new THREE.MeshBasicMaterial({
        map: this._letterTexture('MURAL', '#c9e8dc', 1),
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    muralTag.rotation.x = -Math.PI / 2;
    muralTag.position.set(-5.6, 0.07, 0);
    group.add(muralTag);

    this.group.add(group);
  }

  /** Canvas text used for the floor compass and the mechanism letters. */
  _letterTexture(text, color = '#dfeee4', aspect = 1) {
    this._letterCache ||= {};
    const key = `${text}|${color}|${aspect}`;
    if (this._letterCache[key]) return this._letterCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = Math.max(64, Math.round(256 / aspect));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const size = text.length > 2 ? 74 : 190;
      ctx.font = `600 ${size}px Georgia, "Palatino Linotype", serif`;
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    this._letterCache[key] = texture;
    return texture;
  }

  _buildWalls(highQuality) {
    const wallMat = new THREE.MeshStandardMaterial({ color: '#8d8b7d', roughness: 1 });
    const addWall = (x, z, length, rotation, height = 3.4) => {
      const wall = createWallSegment({ length, height, thickness: 0.9, seed: Math.round(x + z) + 20 });
      this.add(wall, { x, z, rotation, camera: true });
      this.addColliderBox(x, z, length / 2, 0.55, rotation);
      return wall;
    };

    // Courtyard perimeter with a south entrance and a north gate.
    addWall(-10.5, 15, 9, 0);
    addWall(10.5, 15, 9, 0);
    addWall(-15, 0, 30, Math.PI / 2);
    addWall(15, 0, 30, Math.PI / 2);
    addWall(-10.8, -15, 8.4, 0);
    addWall(10.8, -15, 8.4, 0);
    addWall(-10, -22.5, 15, Math.PI / 2);
    addWall(10, -22.5, 15, Math.PI / 2);
    addWall(0, -30, 20, 0);

    // Broken pillars around the courtyard.
    const positions = [
      [-12, -12, 7],
      [12, -12, 6],
      [-12, 12, 5],
      [12, 12, 7],
      [-7, -7, 4],
      [7, -7, 5],
    ];
    for (let i = 0; i < positions.length; i++) {
      const [x, z, height] = positions[i];
      const pillar = createPillar({ height, radius: 0.55, broken: i % 3 !== 0, seed: i + 4 });
      this.add(pillar, { x, z, y: this.heightAt(x, z), camera: true });
      this.addColliderCircle(x, z, 0.62);
    }

    // Rubble
    const random = rng(51);
    for (let i = 0; i < 26; i++) {
      const x = (random() - 0.5) * 28;
      const z = (random() - 0.5) * 28;
      if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
      const rock = createRock({ scale: 0.3 + random() * 0.7, seed: i + 5, color: '#8b887b' });
      this.add(rock, { x, z, y: this.heightAt(x, z) });
    }
  }

  _buildMural() {
    const muralGroup = new THREE.Group();
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 2.6, 0.16),
      new THREE.MeshStandardMaterial({ color: '#7f7d70', roughness: 1 }),
    );
    panel.position.y = 1.9;
    muralGroup.add(panel);

    // Three winds painted as glyphs.
    const glyphMat = new THREE.MeshBasicMaterial({ color: '#c9e8dc', transparent: true, opacity: 0.85 });
    for (let i = 0; i < 3; i++) {
      const glyph = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 4, 16, Math.PI * 1.4), glyphMat);
      glyph.position.set(-1.3 + i * 1.3, 2.1 + (i === 2 ? -0.1 : 0.1), 0.1);
      glyph.rotation.z = i * 1.3;
      muralGroup.add(glyph);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glyphMat);
      dot.position.set(-1.3 + i * 1.3, 1.6, 0.1);
      muralGroup.add(dot);
    }
    markShadows(muralGroup);
    this.add(muralGroup, { x: -14.2, z: 0, y: this.heightAt(-14.2, 0), rotation: Math.PI / 2 });
    this.addCameraObstacle(muralGroup);
    this.addInteractable({
      id: 'mural',
      x: -13,
      z: 0,
      y: this.heightAt(-13, 0) + 2,
      radius: 3,
      prompt: 'Study the mural',
      glyph: '✎',
      action: () => this.game.openLore('ruinMural'),
      marker: 'poi',
    });
  }

  _buildMechanisms() {
    const specs = [
      { id: 'east', x: 12.6, z: 2.5, color: '#a9e6d6' },
      { id: 'north', x: 3.6, z: -13, color: '#bcd6f0' },
      { id: 'south', x: 7.4, z: 12.6, color: '#d8c8f0' },
    ];
    const letters = { east: 'E', north: 'N', south: 'S' };
    for (const spec of specs) {
      const mechanism = createMechanism({ color: spec.color, seed: spec.x });
      this.add(mechanism, { x: spec.x, z: spec.z, y: this.heightAt(spec.x, spec.z), rotation: spec.x });
      this.addUpdate(mechanism.userData.update);
      this.addColliderCircle(spec.x, spec.z, 0.85);
      this.mechanisms[spec.id] = mechanism;

      // A direction letter floating over each mechanism. Their prompts and the
      // floor compass use the same words, so the mural's order is unambiguous.
      const letter = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this._letterTexture(letters[spec.id], '#f2e3b8'),
          transparent: true,
          depthWrite: false,
          opacity: 0.9,
        }),
      );
      letter.position.set(spec.x, this.heightAt(spec.x, spec.z) + 2.75, spec.z);
      letter.scale.set(0.9, 0.9, 1);
      this.group.add(letter);

      this.addInteractable({
        id: `mechanism-${spec.id}`,
        x: spec.x,
        z: spec.z,
        y: this.heightAt(spec.x, spec.z) + 1.4,
        radius: 2.8,
        prompt: () => `Wake the ${spec.id} wind mechanism ${letters[spec.id] ? `(${letters[spec.id]})` : ''}`,
        glyph: '✧',
        action: () => this.activateMechanism(spec.id),
        marker: 'poi',
      });
    }
  }

  activateMechanism(id) {
    if (this.solved) {
      this.game.hud.toast({ icon: '✦', text: 'The mechanism is already awake.', variant: 'hint' });
      return;
    }
    if (id === SEQUENCE[this.step]) {
      const mechanism = this.mechanisms[id];
      mechanism.userData.setLit(true);
      mechanism.userData.pulse();
      this.step++;
      this.game.audio.play('mechanism');
      this.game.cinematics.flashScreen('#d8fff4', 300);
      this.game.quests.setFlag('L2_lit', this.step);
      this.game.hud.setPuzzleProgress?.(this.step, Math.min(SEQUENCE.length - 1, this.step));

      if (this.step >= SEQUENCE.length) {
        this._solve();
      } else {
        this.game.hud.toast({
          icon: '✧',
          text: `The ${id} wind answers. ${SEQUENCE.length - this.step} remain.`,
          variant: 'hint',
        });
      }
      return;
    }

    // Wrong order → reset with a clear, forgiving message.
    this.wrongAttempts++;
    this.step = 0;
    this.game.quests.setFlag('L2_lit', 0);
    for (const mechanism of Object.values(this.mechanisms)) mechanism.userData.setLit(false);
    this.game.hud.setPuzzleProgress?.(0, 0);
    this.game.audio.play('puzzleFail');
    this.game.cameraController.shake(0.09, 0.3);
    this.game.hud.toast({ icon: '✕', text: BARKS.wrongOrder, variant: 'hint' });
    if (this.wrongAttempts === 2) {
      this.game.hud.toast({
        icon: '✎',
        text: 'Hint — the mural on the west wall names the order: east, then north, then south. There is no fourth mechanism; west is where you read.',
        variant: 'hint',
      });
    } else if (this.wrongAttempts >= 4) {
      this.game.hud.toast({
        icon: '✎',
        text: 'Hint — press E at the eastern mechanism (letter E, right of the gate). Then north, then south.',
        variant: 'hint',
      });
    }
  }

  _solve() {
    this.solved = true;
    this.game.quests.setFlag('L2_puzzleSolved', true);
    this.game.quests.setFlag('L2_gateOpened', true);
    this.game.audio.play('unlock');
    this.game.cinematics.flashScreen('#e8fff8', 900);
    this.game.cameraController.shake(0.16, 0.6);
    this.game.hud.hidePuzzlePanel?.();
    this.game.hud.toast({
      icon: '✦',
      kicker: 'The Order Remembered',
      text: 'The sealed gate grinds upward.',
      variant: 'quest',
    });
    this._openGate();
  }

  _buildGateAndChamber() {
    // Portcullis
    const gateGroup = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#5b5850', metalness: 0.8, roughness: 0.5 });
    for (let i = 0; i < 7; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 4.2, 6), metal);
      bar.position.set(-2.1 + i * 0.7, 2.1, 0);
      gateGroup.add(bar);
    }
    for (let j = 0; j < 3; j++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.14, 0.14), metal);
      beam.position.set(0, 0.7 + j * 1.4, 0);
      gateGroup.add(beam);
    }
    markShadows(gateGroup);
    this.gateGroup = gateGroup;
    this.add(gateGroup, { x: 0, z: -15.2, y: 0 });
    this._gateCollider = this.addColliderBox(0, -15.2, 2.4, 0.4);

    // Torches flanking the gate (only one real light for performance).
    const torchL = createTorch({ height: 2.2, withLight: true });
    this.add(torchL, { x: -3.2, z: -14.4, y: 0, castShadow: false });
    this.addUpdate(torchL.userData.update);
    const torchR = createTorch({ height: 2.2, withLight: false });
    this.add(torchR, { x: 3.2, z: -14.4, y: 0, castShadow: false });
    this.addUpdate(torchR.userData.update);

    // Inner chamber: pedestal with the chronicle fragment.
    const pedestal = createPedestal({ height: 1.1, radius: 0.7 });
    this.add(pedestal, { x: 0, z: -21, y: 0 });
    this.addColliderCircle(0, -21, 0.8);

    const pageGroup = new THREE.Group();
    const page = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.66),
      new THREE.MeshStandardMaterial({
        color: '#f1e3bf',
        emissive: '#e8d3a0',
        emissiveIntensity: 0.55,
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
    );
    page.rotation.x = -Math.PI / 2;
    page.rotation.z = 0.2;
    pageGroup.add(page);
    pageGroup.position.set(0, 1.32, -21);
    this.group.add(pageGroup);
    this.pageGroup = pageGroup;
    pageGroup.visible = !this.game.state.flags.L2_fragmentFound;

    const pageLight = new THREE.PointLight('#ffe3a8', 3, 7, 2);
    pageLight.position.set(0, 1.6, -21);
    this.group.add(pageLight);
    this.addUpdate((dt, time) => {
      pageGroup.rotation.y += dt * 0.16;
      pageGroup.position.y = 1.32 + Math.sin(time * 1.4) * 0.045;
      pageLight.intensity = 2.4 + Math.sin(time * 2.1) * 0.5;
    });

    this.addInteractable({
      id: 'ruin-fragment',
      x: 0,
      z: -21,
      y: 1.5,
      radius: 2.8,
      prompt: 'Take the chronicle fragment',
      glyph: '❧',
      action: () => {
        if (!this.solved) {
          this.game.hud.toast({ icon: '✦', text: 'The gate will not open until the winds are woken in order.', variant: 'hint' });
          return;
        }
        if (this.game.state.flags.L2_fragmentFound) return;
        pageGroup.visible = false;
        this.game.quests.setFlag('L2_fragmentFound', true);
        this.game.inventory.add('archiveFragment', 1);
        this.game.audio.play('page');
        this.game.cinematics.flashScreen('#ffeec4', 500);
        this.game.hud.toast({
          icon: '❧',
          kicker: 'The First Fragment',
          text: 'The chronicle has begun to return.',
          variant: 'item',
        });
      },
      enabled: () => !this.game.state.flags.L2_fragmentFound,
      marker: 'relic',
    });

    // Stairs down to the archive (activated when chapter 2 completes).
    const stairWell = new THREE.Group();
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.16, 6, 24),
      new THREE.MeshStandardMaterial({ color: '#8b8779', roughness: 0.95 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.1;
    stairWell.add(rim);
    const darkMat = new THREE.MeshBasicMaterial({ color: '#0a0f12' });
    const dark = new THREE.Mesh(new THREE.CircleGeometry(1.7, 20), darkMat);
    dark.rotation.x = -Math.PI / 2;
    dark.position.y = 0.06;
    stairWell.add(dark);
    this.add(stairWell, { x: 0, z: -27.5, y: 0 });

    const stairRune = createRuneCircle({ color: '#b9e6d8', radius: 2.0, opacity: 0.25 });
    stairRune.position.set(0, 0.2, -27.5);
    this.group.add(stairRune);
    this.addUpdate(stairRune.userData.update);
    // createRuneCircle returns a Group; the glowing disc is its first child.
    this._stairRune = stairRune;
    this._stairRuneDisc = stairRune.children[0] || null;

    this._stairInteractable = this.addInteractable({
      id: 'archive-stair',
      x: 0,
      z: -27.5,
      y: 1.4,
      radius: 3,
      prompt: 'Descend into the sealed archive',
      glyph: '↓',
      action: () => {
        if (!this.game.state.completed.includes(2)) {
          this.game.hud.toast({ icon: '✦', text: 'The stair is sealed. Something is still missing from this ruin.', variant: 'hint' });
          this.game.audio.play('locked');
          return;
        }
        this.game.levels.requestTravel('archive', 'default', { level: 3 });
      },
    });

    // Return gate to the woods.
    const returnGate = createWaystone({ color: '#cfe0b0', height: 2.0 });
    this.add(returnGate, { x: -8, z: 12, y: this.heightAt(-8, 12) });
    this.addUpdate(returnGate.userData.update);
    this.addColliderCircle(-8, 12, 0.8);
    this.addInteractable({
      id: 'return-woods',
      x: -8,
      z: 12,
      y: this.heightAt(-8, 12) + 2,
      radius: 2.8,
      prompt: 'Return to the Whispering Woods',
      glyph: '↩',
      action: () => this.game.levels.requestTravel('whisperingWoods', 'fromRuins', { level: 2 }),
    });
  }

  _openGate() {
    if (this._gateCollider) this._gateCollider.disabled = true;
    this._gateTarget = 4.4;
    this.addUpdate((dt) => {
      if (this.gateGroup.position.y < this._gateTarget) {
        this.gateGroup.position.y = Math.min(this._gateTarget, this.gateGroup.position.y + dt * 1.4);
      }
    });
  }

  _restoreSolved() {
    this.step = SEQUENCE.length;
    for (const mechanism of Object.values(this.mechanisms)) mechanism.userData.setLit(true);
    this._openGate();
    this.gateGroup.position.y = 4.4;
    this.game.hud.hidePuzzlePanel?.();
    this.setStairRuneOpacity(this.game.state.completed.includes(2) ? 0.7 : 0.35);
  }

  _buildDetails() {
    // A few leaning slabs and an old brazier.
    const random = rng(77);
    for (let i = 0; i < 10; i++) {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(1.2 + random(), 0.18, 0.8 + random()),
        new THREE.MeshStandardMaterial({ color: '#8a8779', roughness: 1 }),
      );
      slab.position.set((random() - 0.5) * 26, 0.1, (random() - 0.5) * 26);
      slab.rotation.set((random() - 0.5) * 0.2, random() * Math.PI, (random() - 0.5) * 0.2);
      slab.receiveShadow = true;
      this.group.add(slab);
    }

    // Banner inside the chamber.
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 3.2),
      new THREE.MeshStandardMaterial({ color: '#5b3a34', roughness: 0.95, side: THREE.DoubleSide }),
    );
    banner.position.set(0, 3.2, -29.6);
    this.group.add(banner);
  }

  _buildAmbience() {
    const motes = createParticleField({
      count: 150,
      area: 30,
      height: 8,
      center: [0, 0, -6],
      color: '#dcefe4',
      size: 1.4,
      speed: 0.18,
      drift: 0.6,
      swirl: 0.4,
      opacity: 0.55,
    });
    this.group.add(motes);
    this.addUpdate(motes.userData.update);
  }

  /** Safe to call before the stair exists: it simply does nothing. */
  setStairRuneOpacity(value) {
    const material = this._stairRuneDisc?.material;
    if (material) material.opacity = value;
  }

  onLevelComplete(levelId) {
    if (levelId !== 2) return;
    this.setStairRuneOpacity(0.7);
    this.game.hud.toast({
      icon: '↓',
      kicker: 'Path Opened',
      text: 'The stair below the ruin has woken.',
      variant: 'quest',
    });
    this.addMarker({ x: 0, z: -27.5, type: 'gate', label: 'Archive Stair', id: 'archive-stair-active' });
  }
}
