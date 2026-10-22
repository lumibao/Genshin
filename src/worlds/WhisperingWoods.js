/**
 * Chapter II, part one — The Whispering Woods.
 *
 * A hushed forest path between the meadow and the Fallen Circle. The woods are
 * the player's first taste of verticality, dappled light and quiet dread — and
 * a place to practise reading the world for hints.
 */
import * as THREE from 'three';
import { BaseWorld } from './BaseWorld.js';
import {
  createArch,
  createBush,
  createClouds,
  createFlower,
  createGrassField,
  createParticleField,
  createRock,
  createRuneCircle,
  createSky,
  createStonePath,
  createTerrain,
  createTree,
  createTreeBatch,
  createWallSegment,
  createWaystone,
  markShadows,
  rng,
  smoothstep,
} from './WorldKit.js';
import { createNPCModel, createQuestMarker } from './NPCKit.js';
import { LORE, BARKS } from '../story/storyData.js';
import { stoneTexture } from '../game/Textures.js';

export class WhisperingWoods extends BaseWorld {
  constructor(context) {
    super(context);
    this.level = 2;
    this.surface = 'grass';
    this.music = 'woods';
    this.ambience = 'woods';
    this.atmosphere = {
      fog: '#8ba595',
      fogNear: 26,
      fogFar: 120,
      background: '#94b0a1',
    };
    this.bounds = { x: 0, z: 0, radius: 42 };
    this.spawns = {
      default: { x: 0, z: 34, yaw: Math.PI },
      fromRuins: { x: 0, z: -27, yaw: Math.PI },
      fromMeadow: { x: 0, z: 34, yaw: Math.PI },
    };
    this._elapsed = 0;
  }

  heightAt(x, z) {
    const rolling =
      Math.sin(x * 0.07) * 1.4 +
      Math.cos(z * 0.06) * 1.2 +
      Math.sin((x - z) * 0.035) * 2.0;
    const pathDist = Math.abs(x - Math.sin(z * 0.09) * 3.2);
    const pathCalm = smoothstep(7, 1.5, pathDist);
    let height = rolling * (1 - pathCalm * 0.55);
    // The woods climb gently toward the ruins.
    height += smoothstep(30, -30, z) * 3.4;
    return height;
  }

  async build() {
    const highQuality = this.game.renderer.tier === 'high';
    this._buildSky();
    this._buildLights(highQuality);
    this._buildGround();
    this._buildWoods(highQuality);
    this._buildMarkers();
    this._buildElowen();
    this._buildGate();
    this._buildAmbience();
  }

  _buildSky() {
    this.sky = createSky({
      top: '#4e7f8f',
      horizon: '#b9c9b4',
      bottom: '#8ba595',
      sunColor: '#f2e7c0',
      sunDir: [0.4, 0.62, -0.5],
      exponent: 1.1,
      radius: 280,
    });
    this.group.add(this.sky);
    this.addUpdate(this.sky.userData.update);

    this.clouds = createClouds({ count: 8, radius: 160, height: 55, scale: 44, seed: 31, opacity: 0.5, color: '#e7f0e4' });
    this.group.add(this.clouds);
    this.addUpdate(this.clouds.userData.update);
  }

  _buildLights(highQuality) {
    const hemi = new THREE.HemisphereLight('#c8e0d4', '#42563e', 1.35);
    this.group.add(hemi);

    const sun = new THREE.DirectionalLight('#f4eccd', 1.9);
    sun.position.set(26, 44, -18);
    if (highQuality) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 120;
      sun.shadow.camera.left = -36;
      sun.shadow.camera.right = 36;
      sun.shadow.camera.top = 36;
      sun.shadow.camera.bottom = -36;
      sun.shadow.bias = -0.0009;
      sun.shadow.normalBias = 0.05;
    }
    this.group.add(sun);

    const fill = new THREE.AmbientLight('#a9c4b4', 0.55);
    this.group.add(fill);

    // Green bounce from the canopy.
    const bounce = new THREE.DirectionalLight('#a8d49a', 0.4);
    bounce.position.set(-20, 6, 20);
    this.group.add(bounce);
  }

  _buildGround() {
    const terrain = createTerrain({
      size: 150,
      segments: 80,
      heightFn: (x, z) => this.heightAt(x, z),
      palette: ['#5d7a45', '#67854b', '#4f6b3c', '#728b4f', '#556b3f'],
      seed: 33,
    });
    this.group.add(terrain);

    // Forest-floor colour variation: patches of moss and bare earth.
    const patchMat = new THREE.MeshStandardMaterial({
      color: '#4a5c38',
      roughness: 1,
      transparent: true,
      opacity: 0.5,
    });
    const random = rng(23);
    for (let i = 0; i < 40; i++) {
      const angle = random() * Math.PI * 2;
      const dist = 4 + random() * 34;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const patch = new THREE.Mesh(new THREE.CircleGeometry(1.2 + random() * 2.4, 7), patchMat);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = random() * Math.PI;
      patch.position.set(x, this.heightAt(x, z) + 0.03, z);
      patch.receiveShadow = true;
      this.group.add(patch);
    }

    const path = createStonePath(
      [
        [0, 38],
        [1.5, 26],
        [-1.5, 16],
        [-2.5, 6],
        [0.5, -4],
        [2, -14],
        [0, -24],
        [0, -31],
      ],
      { width: 1.9, seed: 12, color: '#8f9483' },
    );
    this.group.add(path);
  }

  _buildWoods(highQuality) {
    const random = rng(101);
    const specs = [];
    const pathClear = (x, z) => Math.abs(x - Math.sin(z * 0.09) * 3.2) < 3.4;
    let attempts = 0;
    while (specs.length < (highQuality ? 110 : 66) && attempts < 900) {
      attempts++;
      const angle = random() * Math.PI * 2;
      const dist = 5 + Math.sqrt(random()) * 38;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (pathClear(x, z) && Math.abs(z) < 34) continue;
      if (Math.hypot(x, z - 34) < 6) continue;
      if (Math.hypot(x, z + 27) < 7) continue;
      const height = 7 + random() * 8;
      specs.push({
        x,
        z,
        y: this.heightAt(x, z) - 0.2,
        height,
        rotation: random() * Math.PI * 2,
        canopy: 0.7 + random() * 0.8,
      });
      this.addColliderCircle(x, z, 0.55);
    }

    this.trees = createTreeBatch(specs, {
      trunkColor: '#4b3a2a',
      leafColors: ['#3f6440', '#4a7046', '#35583a', '#557c48'],
    });
    this.group.add(this.trees);
    this.trees.children.forEach((mesh) => {
      mesh.castShadow = highQuality;
    });

    // Close, hand-placed trees to frame the path.
    const heroSpots = [
      [-5.5, 22, 10, 1],
      [6.4, 14, 9, 2],
      [-7.5, 2, 11, 3],
      [8.2, -8, 10, 4],
      [-8.5, -18, 12, 5],
    ];
    for (const [x, z, height, seed] of heroSpots) {
      const tree = createTree({
        height,
        seed,
        canopy: 4,
        leafColors: ['#46683f', '#527a49', '#3c5c3b'],
        trunkColor: '#4d3b2b',
      });
      this.add(tree, { x, z, y: this.heightAt(x, z) - 0.1 });
      this.addColliderCircle(x, z, 0.6);
      this.addUpdate((dt, time) => tree.userData.sway(time * 0.6));
    }

    // Underbrush
    for (let i = 0; i < 60; i++) {
      const angle = random() * Math.PI * 2;
      const dist = 3 + random() * 36;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (pathClear(x, z) && Math.abs(z) < 34) continue;
      const bush = createBush({ scale: 0.7 + random() * 0.9, seed: i + 3, colors: ['#41603c', '#4c6d44'] });
      this.add(bush, { x, z, y: this.heightAt(x, z), castShadow: false });
    }

    for (let i = 0; i < 44; i++) {
      const angle = random() * Math.PI * 2;
      const dist = 2 + random() * 32;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (pathClear(x, z) && Math.abs(z) < 30) continue;
      const flower = createFlower({
        color: ['#d7d9c0', '#c9d4b0', '#e2d9c6'][i % 3],
        stem: '#4f6b3c',
        seed: i,
      });
      this.add(flower, { x, z, y: this.heightAt(x, z), castShadow: false, receiveShadow: false });
    }

    for (let i = 0; i < 30; i++) {
      const angle = random() * Math.PI * 2;
      const dist = 4 + random() * 34;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (pathClear(x, z)) continue;
      const rock = createRock({ scale: 0.8 + random() * 2.2, seed: i + 12, color: '#6f7568' });
      this.add(rock, { x, z, y: this.heightAt(x, z) - 0.1 });
      if (random() > 0.5) {
        const moss = new THREE.Mesh(
          new THREE.SphereGeometry(0.5 + random() * 0.6, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: '#5b7a45', roughness: 1 }),
        );
        moss.position.set(x + 0.2, this.heightAt(x, z) + 0.3, z);
        moss.scale.y = 0.35;
        this.group.add(moss);
      }
    }

    const grass = createGrassField({
      count: highQuality ? 6200 : 3000,
      radius: 40,
      center: [0, 4],
      heightFn: (x, z) => this.heightAt(x, z),
      filterFn: (x, z) => !pathClear(x, z),
      seed: 71,
      scaleRange: [0.7, 1.35],
      fogColor: this.atmosphere.fog,
      fogNear: this.atmosphere.fogNear,
      fogFar: this.atmosphere.fogFar,
      sunDir: [0.4, 0.7, -0.4],
      windStrength: 0.75,
    });
    this.group.add(grass);
    this.addUpdate(grass.userData.update);
  }

  _buildMarkers() {
    // Waystone markers along the trail.
    const stones = [
      { x: 2.6, z: 25, text: ['The stone is carved with a wind-sigil and an arrow pointing north.', 'Someone has scratched below it: \u201cWren\u2019s scholar owes me tea.\u201d'] },
      { x: -3.4, z: 8, text: ['A second marker, half-swallowed by moss. It points north and reads: \u201cThe Circle keeps its own order.\u201d', 'Beneath that, a smaller hand has added: \u201cAsk Elowen. She remembers.\u201d'] },
      { x: 3.2, z: -10, text: ['The third marker leans at an angle, as though listening to the ground.', 'Carved into its base: \u201cEast, then north, then south. Do not guess.\u201d'] },
    ];
    stones.forEach((stone, index) => {
      const group = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({
        map: stoneTexture('default'),
        color: '#8a8d7f',
        roughness: 1,
        flatShading: true,
      });
      const rock = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 0.4), material);
      rock.position.y = 0.85;
      rock.rotation.z = (index - 1) * 0.06;
      group.add(rock);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.5, 4), material);
      cap.position.y = 1.9;
      cap.rotation.y = Math.PI / 4;
      group.add(cap);
      markShadows(group);
      this.add(group, { x: stone.x, z: stone.z, rotation: index * 0.7 });
      this.addColliderCircle(stone.x, stone.z, 0.5);
      this.addInteractable({
        id: `stone-${index}`,
        x: stone.x,
        z: stone.z,
        y: this.heightAt(stone.x, stone.z) + 1.2,
        radius: 2.4,
        prompt: 'Read the moss-covered marker',
        glyph: '✎',
        action: () => this.game.openLore('marker', 'Waystone Marker', stone.text),
      });
    });

    // Ruined arch — the threshold of the Fallen Circle.
    const arch = createArch({ width: 5.4, height: 6.4, depth: 1.6, seed: 21 });
    this.add(arch, { x: 0, z: -30, camera: true });
    this.addColliderBox(-2.7, -30, 0.8, 0.8);
    this.addColliderBox(2.7, -30, 0.8, 0.8);
    const rune = createRuneCircle({ color: '#9fd8c3', radius: 2.4, opacity: 0.34 });
    rune.position.set(0, this.heightAt(0, -30) + 0.06, -30);
    this.group.add(rune);
    this.addUpdate(rune.userData.update);

    this.addInteractable({
      id: 'ruin-gate',
      x: 0,
      z: -30,
      y: this.heightAt(0, -30) + 2,
      radius: 3.4,
      prompt: 'Step through the archway',
      glyph: '➤',
      action: () => this.game.levels.requestTravel('ancientRuins', 'fromWoods', { level: 2 }),
      marker: 'gate',
    });

    // Broken wall to the east, atmosphere.
    const wall = createWallSegment({ length: 7, height: 2.4, thickness: 0.8, seed: 4 });
    this.add(wall, { x: 15, z: -20, rotation: 0.8, camera: true });
    this.addColliderBox(15, -20, 3.6, 0.8, 0.8);
  }

  _buildElowen() {
    const elowen = createNPCModel({
      robeColor: '#4a6150',
      trimColor: '#c4b28a',
      hairColor: '#a85c3c',
      skinColor: '#e8c2a4',
      hood: false,
      staff: false,
      tall: 0.97,
      seed: 8,
    });
    this.elowen = elowen;
    this.add(elowen, { x: -5.8, z: 3.2, rotation: 0.9 });
    this.addUpdate(elowen.userData.update);
    this.addColliderCircle(-5.8, 3.2, 0.5);

    const marker = createQuestMarker({ color: '#cde8bd', offsetY: 2.2 });
    elowen.add(marker);
    this.addUpdate(marker.userData.update);
    this._elowenMarker = marker;

    this.addInteractable({
      id: 'elowen',
      x: -5.8,
      z: 3.2,
      y: this.heightAt(-5.8, 3.2) + 1.4,
      radius: 3,
      prompt: 'Speak with Elowen',
      glyph: '✦',
      action: () => this._talkToElowen(),
      marker: 'npc',
    });

    // A small camp: log seat and lantern.
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.26, 1.6, 7),
      new THREE.MeshStandardMaterial({ color: '#5a4630', roughness: 0.95 }),
    );
    log.rotation.z = Math.PI / 2;
    log.position.set(-6.4, this.heightAt(-6.4, 4.4) + 0.24, 4.4);
    log.rotation.y = 0.4;
    this.group.add(log);
  }

  async _talkToElowen() {
    if (this.game.state.completed.includes(2)) {
      await this.game.dialogue.play('elowen.after');
      return;
    }
    if (this.game.quests.hasFlag('L2_puzzleSolved')) {
      await this.game.dialogue.play('elowen.after');
      return;
    }
    if (this.game.quests.hasFlag('L2_enteredRuins') || this.game.quests.hasFlag('L2_foundRuins')) {
      await this.game.dialogue.play('elowen.hint');
      return;
    }
    await this.game.dialogue.play('elowen.first');
    this.game.quests.setFlag('L2_talkedElowen', true);
    this._elowenMarker?.userData.setVisible(false);
  }

  _buildGate() {
    // Return gate to the meadow.
    const gate = createWaystone({ color: '#cfd9a8', height: 2.2 });
    this.add(gate, { x: 4.4, z: 33, y: this.heightAt(4.4, 33) });
    this.addUpdate(gate.userData.update);
    this.addColliderCircle(4.4, 33, 0.8);
    this.addInteractable({
      id: 'return-meadow',
      x: 4.4,
      z: 33,
      y: this.heightAt(4.4, 33) + 2.2,
      radius: 3,
      prompt: 'Return to the meadow',
      glyph: '↩',
      action: () => this.game.levels.requestTravel('mondstadt', 'fromWoods', { level: 1 }),
    });
  }

  _buildAmbience() {
    const fireflies = createParticleField({
      count: this.game.renderer.isMobile ? 90 : 190,
      area: 46,
      height: 7,
      center: [0, 0, 0],
      color: '#dff5a8',
      size: 1.7,
      speed: 0.16,
      drift: 1.2,
      swirl: 0.8,
      opacity: 0.85,
    });
    this.group.add(fireflies);
    this.addUpdate(fireflies.userData.update);

    const pollen = createParticleField({
      count: 120,
      area: 36,
      height: 10,
      center: [0, 0, 6],
      color: '#f6f1d0',
      size: 1.2,
      speed: 0.3,
      drift: 0.9,
      swirl: 0.5,
      opacity: 0.5,
    });
    this.group.add(pollen);
    this.addUpdate(pollen.userData.update);
  }

  onLevelComplete(levelId) {
    if (levelId === 2) {
      this.game.hud.toast({
        icon: '✦',
        kicker: 'Path Opened',
        text: 'A waystone in the ruins now leads beneath the earth.',
        variant: 'quest',
      });
    }
  }
}
