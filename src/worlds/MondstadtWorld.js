/**
 * Chapter I — Windrise Meadow.
 *
 * A bright Mondstadt-inspired meadow: rolling grass, a distant windmill town,
 * a forgotten wind shrine, a pond, a weathered chest and three drifting wind
 * fragments. This is the world behind the title screen as well.
 */
import * as THREE from 'three';
import { BaseWorld } from './BaseWorld.js';
import {
  createArch,
  createBanner,
  createBush,
  createChest,
  createClouds,
  createCollectible,
  createFlower,
  createGrassField,
  createHouse,
  createParticleField,
  createRock,
  createRuneCircle,
  createSky,
  createStonePath,
  createTerrain,
  createTree,
  createTreeBatch,
  createWallSegment,
  createWater,
  createWaystone,
  createWindmill,
  markShadows,
  rng,
  smoothstep,
} from './WorldKit.js';
import { createNPCModel, createQuestMarker } from './NPCKit.js';
import { BARKS } from '../story/storyData.js';

const POND = { x: -20, z: 9, radius: 7.5 };

export class MondstadtWorld extends BaseWorld {
  constructor(context) {
    super(context);
    this.level = 1;
    this.surface = 'grass';
    this.music = 'meadow';
    this.ambience = 'meadow';
    this.atmosphere = {
      fog: '#c8dbe4',
      fogNear: 55,
      fogFar: 205,
      background: '#a8c9dd',
    };
    this.bounds = { x: 0, z: 0, radius: 52 };

    this.spawns = {
      default: { x: 0, z: 16, yaw: Math.PI },
      fromWoods: { x: 0, z: -18, yaw: Math.PI },
      title: { x: 0, z: 16, yaw: Math.PI },
    };

    this.fragments = [];
    this._fragmentPositions = [
      { x: -13.5, z: 3.5 },
      { x: 12.5, z: 6.5 },
      { x: 5.5, z: -13.5 },
    ];
    this._gate = null;
    this._wrenMarker = null;
  }

  /* ---------------------------------------------------------------- */
  /* Terrain                                                           */
  /* ---------------------------------------------------------------- */

  heightAt(x, z) {
    const rolling =
      Math.sin(x * 0.052) * 1.15 +
      Math.cos(z * 0.047) * 1.05 +
      Math.sin((x + z) * 0.024) * 1.9 +
      Math.cos((x - z) * 0.031) * 0.75;

    const distFromSpawn = Math.hypot(x, z - 8);
    const calm = smoothstep(6, 30, distFromSpawn);
    let height = rolling * (0.22 + calm * 0.78);

    // Northern rise where the windmill and the shrine stand.
    height += smoothstep(10, 42, -z + 8) * 2.6;

    // A soft bowl for the pond.
    const pondDist = Math.hypot(x - POND.x, z - POND.z);
    height -= smoothstep(POND.radius + 5, POND.radius - 2, pondDist) * 1.9;

    // The meadow flattens around the shrine and the path.
    const shrineDist = Math.hypot(x + 2, z + 3);
    height -= smoothstep(12, 3, shrineDist) * 0.5;

    return height;
  }

  getSurface() {
    const p = this.game.player?.position;
    if (!p) return 'grass';
    if (Math.hypot(p.x - POND.x, p.z - POND.z) < POND.radius + 1.5) return 'water';
    if (Math.abs(p.x) < 2.6 && p.z > -22 && p.z < 16) return 'stone';
    return 'grass';
  }

  /* ---------------------------------------------------------------- */
  /* Build                                                             */
  /* ---------------------------------------------------------------- */

  async build() {
    const highQuality = this.game.renderer.tier === 'high';
    this._buildSky();
    this._buildLights(highQuality);
    this._buildTerrain();
    this._buildPath();
    this._buildLandmarks(highQuality);
    this._buildFoliage(highQuality);
    this._buildPond();
    this._buildProps();
    this._buildNPCs();
    this._buildCollectibles();
    this._buildGate();
    this._buildAmbience();

    if (this.game.state.flags.L1_chestOpened) {
      // Restore a chest that was already opened before a reload.
      this._chest?.userData.open();
    }
    if (this.game.state.completed.includes(1)) {
      this._gate?.userData.setActive(true);
      this._gateInteractable.enabled = () => true;
    }
  }

  _buildSky() {
    this.sky = createSky({
      top: '#4f93cf',
      horizon: '#dfe8e6',
      bottom: '#c8dbe4',
      sunColor: '#fff2cd',
      sunDir: [0.55, 0.42, -0.52],
      exponent: 0.8,
      radius: 320,
    });
    this.group.add(this.sky);
    this.addUpdate(this.sky.userData.update);

    this.clouds = createClouds({ count: 14, radius: 190, height: 62, scale: 52, seed: 21, opacity: 0.9 });
    this.group.add(this.clouds);
    this.addUpdate(this.clouds.userData.update);
  }

  _buildLights(highQuality) {
    const hemi = new THREE.HemisphereLight('#cfe7ff', '#7d955c', 1.05);
    this.group.add(hemi);

    const sun = new THREE.DirectionalLight('#fff3d6', 2.5);
    sun.position.set(38, 52, -26);
    if (highQuality) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 140;
      sun.shadow.camera.left = -42;
      sun.shadow.camera.right = 42;
      sun.shadow.camera.top = 42;
      sun.shadow.camera.bottom = -42;
      sun.shadow.bias = -0.0008;
      sun.shadow.normalBias = 0.04;
    }
    this.group.add(sun);
    this.sun = sun;

    const fill = new THREE.AmbientLight('#cfe0f0', 0.32);
    this.group.add(fill);

    // Warm bounce from the grass.
    const bounce = new THREE.DirectionalLight('#ffe3b0', 0.35);
    bounce.position.set(-24, 12, 30);
    this.group.add(bounce);
  }

  _buildTerrain() {
    const terrain = createTerrain({
      size: 190,
      segments: 96,
      heightFn: (x, z) => this.heightAt(x, z),
      palette: ['#7ba455', '#86ad5f', '#6e974b', '#93b667', '#638c46'],
      seed: 12,
    });
    terrain.receiveShadow = true;
    this.group.add(terrain);

    // Far surrounding hills, deliberately low-detail.
    const farHills = createTerrain({
      size: 520,
      segments: 48,
      heightFn: (x, z) => {
        const base =
          6 +
          Math.sin(x * 0.012) * 7 +
          Math.cos(z * 0.011) * 6 +
          Math.sin((x + z) * 0.006) * 10;
        const opening = smoothstep(70, 130, Math.hypot(x, z));
        return base * opening - 2;
      },
      palette: ['#6b9450', '#5e8749', '#789e58'],
      seed: 8,
      receiveShadow: false,
    });
    farHills.position.y = -3;
    farHills.material.fog = true;
    this.group.add(farHills);
  }

  _buildPath() {
    const path = createStonePath(
      [
        [0, 20],
        [0.4, 8],
        [-0.6, -2],
        [0, -12],
        [0, -22],
      ],
      { width: 2.2, seed: 4 },
    );
    this.group.add(path);

    // Path fork toward the chest.
    const fork = createStonePath(
      [
        [0.2, -1],
        [5, -5],
        [10, -9],
        [13, -12],
      ],
      { width: 1.5, seed: 7 },
    );
    this.group.add(fork);
  }

  _buildLandmarks(highQuality) {
    // ---- Forgotten wind shrine
    const shrine = new THREE.Group();
    const shrineStone = new THREE.MeshStandardMaterial({ color: '#a8a294', roughness: 0.96, flatShading: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.5, 0.6, 8), shrineStone);
    base.position.y = 0.3;
    const step = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.22, 8), shrineStone);
    step.position.y = 0.11;
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 1.15, 7), shrineStone);
    pedestal.position.y = 1.1;
    const statue = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.52, 2.0, 7), shrineStone);
    statue.position.y = 2.6;
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), shrineStone);
    shoulders.position.y = 3.6;
    shoulders.scale.set(1.1, 0.7, 0.8);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), shrineStone);
    head.position.y = 4.05;
    head.scale.set(0.9, 1.05, 0.9);

    const wings = new THREE.Group();
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.6, 5), shrineStone);
      wing.position.set(side * 0.55, 3.7, -0.1);
      wing.rotation.z = side * 0.5;
      wing.rotation.x = -0.25;
      wings.add(wing);
    }

    const runeMat = new THREE.MeshBasicMaterial({
      color: '#bdeee2',
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.035, 5, 32), runeMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 3.35;

    shrine.add(step, base, pedestal, statue, shoulders, head, wings, ring);
    markShadows(shrine);
    this.add(shrine, { x: -2, z: -3, y: this.heightAt(-2, -3) });

    this.addUpdate((dt, time) => {
      ring.rotation.z += dt * 0.18;
      ring.position.y = 3.35 + Math.sin(time * 1.1) * 0.08;
      runeMat.opacity = 0.55 + Math.sin(time * 1.7) * 0.18;
    });

    this.addColliderCircle(-2, -3, 2.6);
    this.addCameraObstacle(shrine);
    this.addInteractable({
      id: 'shrine',
      x: -2,
      z: -3,
      radius: 3.4,
      prompt: 'Read the shrine’s inscription',
      glyph: '✦',
      action: () => this.game.openLore('shrine'),
      marker: 'poi',
    });

    // ---- Old wall & chest
    const wall = createWallSegment({ length: 9, height: 2.1, thickness: 0.8, seed: 5 });
    this.add(wall, { x: 14, z: -16, rotation: -0.5, camera: true });
    this.addColliderBox(14, -16, 4.6, 0.8, -0.5);
    const wall2 = createWallSegment({ length: 5, height: 1.4, thickness: 0.7, seed: 9 });
    this.add(wall2, { x: 8.4, z: -18.4, rotation: 0.35, camera: true });
    this.addColliderBox(8.4, -18.4, 2.6, 0.7, 0.35);

    this.chest = createChest({ scale: 1.05 });
    this._chest = this.chest;
    this.add(this.chest, { x: 12.8, z: -13.4, rotation: -0.9 });
    this.addUpdate((dt) => this.chest.userData.update(dt));
    this.addColliderCircle(12.8, -13.4, 0.9);
    this.addInteractable({
      id: 'chest',
      x: 12.8,
      z: -13.4,
      y: this.heightAt(12.8, -13.4) + 1.0,
      radius: 2.7,
      prompt: 'Open the weathered chest',
      glyph: '❖',
      action: () => this._openChest(),
      enabled: () => !this.chest.userData.isOpen,
      marker: 'relic',
    });

    // Ruined arch framing the path to the gate.
    const arch = createArch({ width: 4.2, height: 4.6, depth: 1.0, seed: 12 });
    this.add(arch, { x: 0, z: -20.5, camera: true });
    this.addColliderBox(-2.1, -20.5, 0.6, 0.6);
    this.addColliderBox(2.1, -20.5, 0.6, 0.6);

    // ---- Distant windmills
    this.windmillNear = createWindmill({ height: 15, seed: 3 });
    this.add(this.windmillNear, { x: -27, z: -30, y: this.heightAt(-27, -30) });
    this.addUpdate((dt) => this.windmillNear.userData.spin(dt, 0.32));

    this.windmillFar = createWindmill({ height: 12, seed: 7 });
    this.add(this.windmillFar, { x: 24, z: -46, y: this.heightAt(24, -46) });
    this.addUpdate((dt) => this.windmillFar.userData.spin(dt, 0.26));

    // ---- City silhouette on the northern ridge (not reachable)
    const city = new THREE.Group();
    const houseSpecs = [
      [-8, 0, 5, 3.6, 4.4],
      [-2.5, 2, 4.2, 3.0, 4.0],
      [3, -1, 6, 4.2, 5],
      [9, 2, 4.6, 3.2, 4.2],
      [-13, 3, 5.2, 3.8, 4.6],
    ];
    for (const [x, z, w, h, d] of houseSpecs) {
      const house = createHouse({
        width: w,
        height: h,
        depth: d,
        roofColor: ['#7a4636', '#6c4033', '#84513c'][Math.floor(Math.abs(x)) % 3],
        wallColor: '#e9dfc9',
      });
      house.position.set(x, 0, z);
      city.add(house);
    }
    for (let i = 0; i < 4; i++) {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 1.6, 9 + i * 2, 8),
        new THREE.MeshStandardMaterial({ color: '#ded4bd', roughness: 0.95 }),
      );
      tower.position.set(-18 + i * 10, (9 + i * 2) / 2, -6 - i * 2);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(1.8, 2.6, 8),
        new THREE.MeshStandardMaterial({ color: '#6d4436', roughness: 0.9 }),
      );
      roof.position.set(tower.position.x, 9 + i * 2 + 1.3, tower.position.z);
      city.add(tower, roof);
    }
    const cityY = this.heightAt(38, -58) + 2;
    city.position.set(40, cityY, -62);
    city.rotation.y = -0.4;
    city.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    this.group.add(city);
    this.city = city;

    // Distant mountains (simple silhouettes behind the fog).
    const mountainMat = new THREE.MeshStandardMaterial({ color: '#7b95a4', roughness: 1, flatShading: true });
    for (let i = 0; i < 7; i++) {
      const height = 30 + (i % 3) * 14;
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(34 + (i % 4) * 12, height, 5), mountainMat);
      const angle = -1.9 + i * 0.55;
      mountain.position.set(Math.cos(angle) * 230, height / 2 - 8, Math.sin(angle) * 230);
      mountain.rotation.y = i;
      this.group.add(mountain);
    }
  }

  _buildFoliage(highQuality) {
    const random = rng(42);
    const treeSpecs = [];
    const avoidZones = [
      { x: 0, z: 6, r: 12 },
      { x: -2, z: -3, r: 8 },
      { x: 13, z: -14, r: 8 },
      { x: POND.x, z: POND.z, r: POND.radius + 5 },
      { x: 0, z: -22, r: 7 },
    ];
    const blocked = (x, z) => avoidZones.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.r);

    let attempts = 0;
    while (treeSpecs.length < (highQuality ? 46 : 30) && attempts < 400) {
      attempts++;
      const angle = random() * Math.PI * 2;
      const dist = 16 + Math.sqrt(random()) * 42;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (blocked(x, z)) continue;
      if (Math.abs(x) < 4 && z > -24) continue; // keep the path clear
      treeSpecs.push({
        x,
        z,
        y: this.heightAt(x, z) - 0.15,
        height: 5 + random() * 4.5,
        rotation: random() * Math.PI * 2,
        canopy: 0.7 + random() * 0.6,
      });
      this.addColliderCircle(x, z, 0.55);
    }

    this.trees = createTreeBatch(treeSpecs, {
      trunkColor: '#6b5138',
      leafColors: ['#4f7c46', '#5f8f4f', '#436e3f', '#6b9a56'],
    });
    this.group.add(this.trees);
    this.trees.children.forEach((mesh) => {
      mesh.castShadow = highQuality;
      mesh.receiveShadow = false;
    });

    // Hero trees near the shrine and pond.
    const heroSpots = [
      [-9.5, -6.5, 7.2],
      [8, 12, 6.4],
      [-16, -1.5, 6.8],
    ];
    for (let i = 0; i < heroSpots.length; i++) {
      const [x, z, height] = heroSpots[i];
      const tree = createTree({
        height,
        seed: i + 3,
        leafColors: ['#54824a', '#669455', '#47723f'],
      });
      this.add(tree, { x, z, y: this.heightAt(x, z) - 0.1 });
      this.addColliderCircle(x, z, 0.5);
      this.addUpdate((dt, time) => tree.userData.sway(time));
    }

    // Bushes and flowers.
    for (let i = 0; i < 34; i++) {
      const angle = random() * Math.PI * 2;
      const dist = 6 + random() * 42;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (blocked(x, z) || (Math.abs(x) < 3 && z > -24)) continue;
      const bush = createBush({ scale: 0.8 + random() * 0.6, seed: i + 5 });
      this.add(bush, { x, z, y: this.heightAt(x, z), castShadow: false });
    }

    const flowerColors = ['#f0e2b4', '#e8cfd8', '#cfe3f0', '#f2d9a0'];
    for (let i = 0; i < 90; i++) {
      const angle = random() * Math.PI * 2;
      const dist = 4 + random() * 38;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (blocked(x, z)) continue;
      const flower = createFlower({
        color: flowerColors[Math.floor(random() * flowerColors.length)],
        seed: i,
      });
      this.add(flower, { x, z, y: this.heightAt(x, z), castShadow: false, receiveShadow: false });
    }

    for (let i = 0; i < 16; i++) {
      const angle = random() * Math.PI * 2;
      const dist = 10 + random() * 36;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (blocked(x, z)) continue;
      const rock = createRock({ scale: 0.6 + random() * 1.4, seed: i + 8, color: '#8f8d80' });
      this.add(rock, { x, z, y: this.heightAt(x, z) - 0.1 });
    }

    // Wind-blown grass field.
    const grass = createGrassField({
      count: highQuality ? 9500 : 4200,
      radius: 50,
      center: [0, 4],
      heightFn: (x, z) => this.heightAt(x, z),
      filterFn: (x, z) => {
        if (blocked(x, z)) return false;
        if (Math.abs(x) < 1.9 && z > -24 && z < 20) return false; // path
        return true;
      },
      seed: 17,
      fogColor: this.atmosphere.fog,
      fogNear: this.atmosphere.fogNear,
      fogFar: this.atmosphere.fogFar,
      sunDir: [0.55, 0.7, -0.4],
      windStrength: 1.15,
    });
    this.group.add(grass);
    this.addUpdate(grass.userData.update);
    this.grass = grass;
  }

  _buildPond() {
    const centerY = this.heightAt(POND.x, POND.z);
    const water = createWater({ size: POND.radius * 2.6, color: '#79b0bd', depthColor: '#3a6a7c', opacity: 0.78 });
    water.position.set(POND.x, centerY + 0.42, POND.z);
    this.group.add(water);
    this.addUpdate(water.userData.update);

    // Reeds
    const random = rng(88);
    for (let i = 0; i < 26; i++) {
      const angle = random() * Math.PI * 2;
      const dist = POND.radius * (0.75 + random() * 0.35);
      const x = POND.x + Math.cos(angle) * dist;
      const z = POND.z + Math.sin(angle) * dist;
      const reed = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.02, 0.8 + random() * 0.6, 4),
        new THREE.MeshStandardMaterial({ color: '#6f8b4f', roughness: 0.9 }),
      );
      reed.position.set(x, this.heightAt(x, z) + 0.4, z);
      reed.rotation.z = (random() - 0.5) * 0.2;
      this.group.add(reed);
    }

    this.addMarker({ x: POND.x, z: POND.z, type: 'water', label: 'Stillwater Pond' });
  }

  _buildProps() {
    // Training sign near the spawn.
    const sign = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 1.6, 5),
      new THREE.MeshStandardMaterial({ color: '#6d5032', roughness: 0.9 }),
    );
    post.position.y = 0.8;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.7, 0.07),
      new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 0.92 }),
    );
    board.position.y = 1.5;
    sign.add(post, board);
    markShadows(sign);
    this.add(sign, { x: 2.6, z: 12.5, rotation: 0.3 });
    this.addColliderCircle(2.6, 12.5, 0.35);
    this.addInteractable({
      id: 'travel-sign',
      x: 2.6,
      z: 12.5,
      y: this.heightAt(2.6, 12.5) + 1.2,
      radius: 2.6,
      prompt: 'Read the wayfarer’s sign',
      glyph: '✎',
      action: () => this.game.openLore('shrine', 'Wayfarer’s Sign', ['\u201cThe road north is kind. The road east is shorter. The road you are meant to take will feel like it chose you.\u201d', 'Below, in fresher ink: \u201cWASD / left stick to walk · drag or right side to look · E / ✦ to interact · Shift to run · Space to jump.\u201d']),
    });

    // Scattered crates and a barrel near the wall (a hint that someone camps here).
    const crate = this.createSimpleCrate();
    this.add(crate, { x: 15.5, z: -11.6, rotation: 0.4 });
    this.addColliderBox(15.5, -11.6, 0.5, 0.5, 0.4);
    const crate2 = this.createSimpleCrate(0.7);
    this.add(crate2, { x: 14.6, z: -11.1, y: this.heightAt(14.6, -11.1) + 0.9, rotation: 1.1 });

    const rune = createRuneCircle({ color: '#b8ecdc', radius: 2.2, opacity: 0.32 });
    rune.position.set(-2, this.heightAt(-2, -3) + 0.08, -3);
    this.group.add(rune);
    this.addUpdate(rune.userData.update);

    // Loose banner, a nod to Mondstadt's festival colours.
    const banner = createBanner({ width: 1.2, height: 2.8, hue: '#8a3a30' });
    this.add(banner, { x: -1, z: 12.4, y: this.heightAt(-1, 12.4) + 0.4, rotation: 0.2 });
    this.addUpdate((dt, time) => banner.userData.sway(time));
  }

  createSimpleCrate(scale = 1) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#8a6642', roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: '#5d4328', roughness: 0.95 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat);
    box.position.y = 0.4;
    group.add(box);
    for (const y of [0.16, 0.64]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.07, 0.84), dark);
      band.position.y = y;
      group.add(band);
    }
    group.scale.setScalar(scale);
    markShadows(group);
    return group;
  }

  _buildNPCs() {
    const wren = createNPCModel({
      robeColor: '#5c7a6f',
      trimColor: '#d9bd82',
      hairColor: '#8a6a4a',
      hood: true,
      staff: true,
      tall: 1.02,
      seed: 3,
    });
    this.wren = wren;
    this.add(wren, { x: 0.6, z: -2.6, rotation: -0.6 });
    this.addUpdate(wren.userData.update);
    this.addColliderCircle(0.6, -2.6, 0.55);

    const marker = createQuestMarker({ color: '#f7e7b8', offsetY: 2.25 });
    wren.add(marker);
    this.wrenMarker = marker;
    this.addUpdate(marker.userData.update);

    this.addInteractable({
      id: 'wren',
      x: 0.6,
      z: -2.6,
      y: this.heightAt(0.6, -2.6) + 1.4,
      radius: 3.0,
      prompt: 'Speak with Wren',
      glyph: '✦',
      action: () => this._talkToWren(),
      marker: 'npc',
    });

    this.addUpdate((dt, time) => {
      // Face the player when they are close.
      const player = this.game.player;
      if (!player) return;
      const dx = player.position.x - wren.position.x;
      const dz = player.position.z - wren.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 6) {
        const target = Math.atan2(dx, dz);
        let delta = target - wren.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        wren.rotation.y += delta * Math.min(1, dt * 2.2);
      }
    });
  }

  _buildCollectibles() {
    this._fragmentPositions.forEach((pos, index) => {
      const fragment = createCollectible({ color: '#9fe8d8', coreColor: '#eafff9', scale: 1 });
      this.add(fragment, { x: pos.x, z: pos.z, castShadow: false });
      this.fragments.push(fragment);
      this.addUpdate(fragment.userData.update);

      const collected = !!this.game.state.flags[`L1_frag${index}`];
      fragment.visible = !collected;

      this.addInteractable({
        id: `fragment-${index}`,
        x: pos.x,
        z: pos.z,
        y: fragment.position.y + 1.0,
        radius: 2.5,
        prompt: 'Gather the wind fragment',
        glyph: '❖',
        action: () => {
          if (fragment.visible === false) return;
          fragment.userData.collect();
          this.game.quests.setFlag(`L1_frag${index}`, true);
          this.game.inventory.add('windFragment', 1);
          this.game.audio.play('fragment');
          this.game.cinematics.flashScreen('#d8fff4', 420);
          this.game.hud.toast({
            icon: '❖',
            kicker: 'Wind Fragment',
            text: `${this.game.inventory.count('windFragment')} of 3 gathered`,
            variant: 'item',
          });
          if (this.game.inventory.count('windFragment') >= 3) {
            this.game.quests.setFlag('L1_fragmentsDone', true);
            this.game.hud.toast({ icon: '✦', text: 'Wren is waiting by the shrine.', variant: 'hint' });
          }
        },
        enabled: () => fragment.visible,
        heightRange: 4,
        marker: 'relic',
      });
    });
  }

  _buildGate() {
    const gate = createWaystone({ color: '#a9e3d4', height: 2.8, label: 'Wind Gate' });
    const x = 0;
    const z = -24.5;
    this.add(gate, { x, z, y: this.heightAt(x, z) });
    this._gate = gate;
    gate.userData.setActive(this.game.state.completed.includes(1));
    this.addUpdate(gate.userData.update);
    this.addColliderCircle(x, z, 0.8);

    const markerRing = createRuneCircle({ color: '#a9e3d4', radius: 2.6, opacity: 0.4 });
    markerRing.position.set(x, this.heightAt(x, z) + 0.06, z);
    this.group.add(markerRing);
    this.addUpdate(markerRing.userData.update);

    this._gateInteractable = this.addInteractable({
      id: 'wind-gate',
      x,
      z,
      y: this.heightAt(x, z) + 2.6,
      radius: 3.2,
      prompt: () => (this.game.state.completed.includes(1) ? 'Follow the wind to the Whispering Woods' : 'Touch the silent wind gate'),
      glyph: '➤',
      action: () => {
        if (!this.game.state.completed.includes(1)) {
          this.game.hud.toast({ icon: '✦', text: BARKS.shrineSealed, variant: 'hint' });
          this.game.audio.play('locked');
          return;
        }
        this.game.levels.requestTravel('whisperingWoods', 'default', { level: 2 });
      },
      marker: null,
    });
    this.addMarker({ x, z, type: 'gate', label: 'Wind Gate', id: 'wind-gate' });
  }

  _buildAmbience() {
    const motes = createParticleField({
      count: this.game.renderer.isMobile ? 120 : 240,
      area: 52,
      height: 14,
      center: [0, 0, -4],
      color: '#fff3cd',
      size: 1.3,
      speed: 0.22,
      drift: 0.9,
      swirl: 0.6,
      opacity: 0.7,
    });
    this.group.add(motes);
    this.addUpdate(motes.userData.update);

    // Dandelion seeds drifting across the meadow.
    const seeds = createParticleField({
      count: 70,
      area: 40,
      height: 9,
      center: [2, 0, 4],
      color: '#ffffff',
      size: 1.9,
      speed: 0.4,
      drift: 1.6,
      swirl: 0.9,
      opacity: 0.45,
    });
    this.group.add(seeds);
    this.addUpdate(seeds.userData.update);
  }

  /* ---------------------------------------------------------------- */
  /* Interactions                                                      */
  /* ---------------------------------------------------------------- */

  async _talkToWren() {
    const quests = this.game.quests;
    const inv = this.game.inventory;
    const flags = quests.flags;

    if (this.game.state.completed.includes(1)) {
      await this.game.dialogue.play('wren.farewell');
      return;
    }
    if (flags.L1_chestOpened && inv.count('windFragment') >= 3) {
      await this.game.dialogue.play('wren.chest');
      quests.setFlag('L1_reported', true);
      this.game.cinematics.completeChapter(1);
      return;
    }
    if (flags.L1_talkedWren) {
      if (inv.count('windFragment') === 0) {
        await this.game.dialogue.play('wren.reminder');
      } else if (inv.count('windFragment') < 3) {
        await this.game.dialogue.play('wren.progress');
      } else if (!flags.L1_chestOpened) {
        await this.game.dialogue.play('wren.after');
      } else {
        await this.game.dialogue.play('wren.reminder');
      }
      return;
    }

    await this.game.dialogue.play('wren.first');
    quests.setFlag('L1_talkedWren', true);
    this.game.hud.toast({ icon: '✦', text: 'Quest updated — gather three wind fragments.', variant: 'quest' });
    this.wrenMarker?.userData.setVisible(false);
  }

  async _openChest() {
    if (this.chest.userData.isOpen) return;
    this.chest.userData.open();
    this.game.audio.play('chest');
    this.game.cinematics.flashScreen('#ffe9b8', 600);
    this.game.quests.setFlag('L1_chestOpened', true);
    this.game.inventory.add('archiveKey', 1);
    this.game.hud.toast({
      icon: '⚿',
      kicker: 'Treasure',
      text: 'Ancient Archive Key',
      detail: 'A heavy key, warm despite the cold iron.',
      variant: 'item',
    });
    const marker = this.markers.find((m) => m.id === 'chest');
    if (marker) marker.done = true;
  }

  onLevelComplete(levelId) {
    if (levelId !== 1) return;
    this._gate?.userData.setActive(true);
    this.game.hud.toast({
      icon: '➤',
      kicker: 'Path Opened',
      text: 'A wind gate has woken at the north of the meadow.',
      variant: 'quest',
    });
    this._gateInteractable.prompt = 'Follow the wind to the Whispering Woods';
    this.addMarker({ x: 0, z: -24.5, type: 'gate', label: 'Wind Gate', id: 'wind-gate-active' });
  }

  /** Title-screen flyover framing. */
  getTitleCamera() {
    return {
      center: [0, 0, -6],
      radius: 30,
      height: 15,
      lookHeight: 4,
      speed: 0.035,
    };
  }
}
