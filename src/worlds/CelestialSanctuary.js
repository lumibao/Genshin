/**
 * The optional ending area — a small celestial sanctuary.
 *
 * Floating islands, a luminous tree, a star sea, glowing flowers and a winding
 * lit path. The personalised inscription is rendered by FinalEnding/BookUI in
 * the UI layer, never here.
 */
import * as THREE from 'three';
import { BaseWorld } from './BaseWorld.js';
import {
  createClouds,
  createFloatingIsland,
  createGlowFlowers,
  createParticleField,
  createPedestal,
  createRuneCircle,
  createSky,
  createWaystone,
  markShadows,
  rng,
} from './WorldKit.js';
import { AncientBook } from './AncientBook.js';

export class CelestialSanctuary extends BaseWorld {
  constructor(context) {
    super(context);
    this.level = 5;
    this.surface = 'stone';
    this.music = 'sanctuary';
    this.ambience = 'celestial';
    this.atmosphere = {
      fog: '#1a1430',
      fogNear: 45,
      fogFar: 190,
      background: '#0b0a1a',
    };
    this.bounds = { x: 0, z: -2, radius: 17 };
    this.spawns = {
      default: { x: 0, z: 13, yaw: Math.PI },
      fromLibrary: { x: 0, z: 13, yaw: Math.PI },
    };
    this._started = false;
  }

  heightAt(x, z) {
    const dist = Math.hypot(x, z + 2);
    if (dist < 13) return 0;
    return Math.pow((dist - 13) / 4, 2) * 2.4;
  }

  async build() {
    this._buildSky();
    this._buildLights();
    this._buildIsland();
    this._buildTree();
    this._buildPath();
    this._buildBook();
    this._buildAmbience();
    this._buildReturnGate();
  }

  _buildSky() {
    this.sky = createSky({
      top: '#0a0c22',
      horizon: '#3a2c5c',
      bottom: '#161232',
      sunColor: '#e6dcff',
      sunDir: [0.3, 0.35, -0.6],
      stars: 1.8,
      exponent: 1.4,
      radius: 340,
    });
    this.group.add(this.sky);
    this.addUpdate(this.sky.userData.update);

    const nebula = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this._makeNebulaTexture(),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: '#9d8ad0',
      }),
    );
    nebula.position.set(-100, 70, -210);
    nebula.scale.set(200, 120, 1);
    this.group.add(nebula);

    this.clouds = createClouds({ count: 8, radius: 130, height: -20, scale: 54, seed: 93, opacity: 0.24, color: '#a9a2d8' });
    this.group.add(this.clouds);
    this.addUpdate(this.clouds.userData.update);
  }

  _makeNebulaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const random = rng(404);
    for (let i = 0; i < 60; i++) {
      const x = random() * 512;
      const y = random() * 256;
      const r = 30 + random() * 100;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(170,150,235,${0.02 + random() * 0.05})`);
      g.addColorStop(1, 'rgba(80,60,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 256);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  _buildLights() {
    this.group.add(new THREE.HemisphereLight('#9f9ed8', '#2a2440', 0.8));
    const key = new THREE.DirectionalLight('#e6dcff', 1.5);
    key.position.set(-20, 40, -10);
    this.group.add(key);
    const rim = new THREE.DirectionalLight('#a9d8e8', 0.7);
    rim.position.set(30, 12, 40);
    this.group.add(rim);
    this.group.add(new THREE.AmbientLight('#6d6398', 0.4));

    const treeLight = new THREE.PointLight('#ffe9b8', 22, 30, 2);
    treeLight.position.set(0, 7, -8);
    this.group.add(treeLight);
    this._treeLight = treeLight;
  }

  _buildIsland() {
    const main = createFloatingIsland({
      radius: 17,
      depth: 9,
      seed: 5,
      topColor: '#5f8f74',
      rockColor: '#5b5470',
    });
    main.position.set(0, -0.4, -2);
    this.group.add(main);

    // Grassy top layer.
    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(16.4, 16.2, 0.4, 36),
      new THREE.MeshStandardMaterial({ color: '#6a9a72', roughness: 0.96 }),
    );
    grass.position.set(0, 0.05, -2);
    grass.receiveShadow = true;
    this.group.add(grass);

    const random = rng(88);
    const islandSpecs = [
      [-26, 4, -18, 4.2],
      [24, 2, -14, 3.6],
      [-18, 6, 18, 3.0],
      [30, 5, 8, 2.6],
      [6, 9, -34, 4.4],
      [-38, 8, -4, 3.2],
      [14, -3, 26, 2.4],
    ];
    for (let i = 0; i < islandSpecs.length; i++) {
      const [x, y, z, radius] = islandSpecs[i];
      const island = createFloatingIsland({
        radius,
        depth: radius * 1.4,
        seed: i + 10,
        topColor: '#5c8a6d',
        rockColor: '#544e6a',
      });
      island.position.set(x, y, z);
      island.rotation.y = random() * Math.PI;
      this.group.add(island);

      // A single glowing tree on some of them.
      if (i % 2 === 0) {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.2, 2.2, 6),
          new THREE.MeshStandardMaterial({ color: '#5a4a54', roughness: 0.9 }),
        );
        trunk.position.set(x, y + 1.4, z);
        this.group.add(trunk);
        const canopy = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1.1, 1),
          new THREE.MeshStandardMaterial({
            color: '#cfe8e0',
            emissive: '#8fd8c4',
            emissiveIntensity: 0.9,
            roughness: 0.7,
          }),
        );
        canopy.position.set(x, y + 3.1, z);
        this.group.add(canopy);
      }
    }

    // Shimmering pools at the island edges.
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(3, 24),
      new THREE.MeshBasicMaterial({ color: '#8fb8e8', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(-9.5, 0.12, 4);
    this.group.add(pool);
  }

  _buildTree() {
    const tree = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#6d5a63', roughness: 0.85, metalness: 0.05 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 7.5, 9), wood);
    trunk.position.y = 3.75;
    tree.add(trunk);

    for (let i = 0; i < 5; i++) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 4, 6), wood);
      const angle = (i / 5) * Math.PI * 2;
      branch.position.set(Math.cos(angle) * 1.2, 5.4 + (i % 2) * 0.8, Math.sin(angle) * 1.2);
      branch.rotation.z = Math.cos(angle) * 0.7;
      branch.rotation.x = -Math.sin(angle) * 0.7;
      tree.add(branch);
    }

    const leafMats = [
      new THREE.MeshStandardMaterial({ color: '#f0e4b8', emissive: '#ffe9a8', emissiveIntensity: 0.85, roughness: 0.7, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: '#d8ecd8', emissive: '#a8e6cc', emissiveIntensity: 0.7, roughness: 0.7, flatShading: true }),
    ];
    const canopy = new THREE.Group();
    const random = rng(12);
    for (let i = 0; i < 12; i++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 + random() * 0.9, 1), leafMats[i % 2]);
      const angle = (i / 12) * Math.PI * 2;
      const radius = 1.6 + random() * 2.4;
      leaf.position.set(Math.cos(angle) * radius, 7.4 + random() * 2.4, Math.sin(angle) * radius);
      leaf.scale.y = 0.8;
      canopy.add(leaf);
    }
    tree.add(canopy);

    markShadows(tree, false, false);
    this.add(tree, { x: 0, z: -9, y: 0 });
    this._tree = tree;
    this.addUpdate((dt, time) => {
      canopy.rotation.y += dt * 0.02;
      canopy.position.y = Math.sin(time * 0.6) * 0.12;
      this._treeLight.intensity = 20 + Math.sin(time * 1.1) * 2.5;
    });

    // Petals drifting from the canopy.
    const petals = createParticleField({
      count: 200,
      area: 18,
      height: 12,
      center: [0, 0, -9],
      color: '#ffe9b8',
      size: 1.6,
      speed: 0.18,
      drift: 1.4,
      swirl: 1.2,
      opacity: 0.8,
    });
    this.group.add(petals);
    this.addUpdate(petals.userData.update);

    // Glowing flowers around the roots.
    for (const [x, z, color] of [
      [-3.5, -6, '#cfe8ff'],
      [3.2, -7.5, '#ffd9e8'],
      [-5, -11, '#d8e8ff'],
      [4.6, -4.5, '#fff0c0'],
    ]) {
      const flowers = createGlowFlowers({ count: 8, radius: 1.3, color, seed: x + z + 20 });
      flowers.position.set(x, 0, z);
      this.group.add(flowers);
    }

    const ring = createRuneCircle({ color: '#f2e2b0', radius: 4.5, opacity: 0.3 });
    ring.position.set(0, 0.06, -9);
    this.group.add(ring);
    this.addUpdate(ring.userData.update);

    this.addMarker({ x: 0, z: -9, type: 'relic', label: 'The Luminous Tree' });
  }

  _buildPath() {
    // Winding illuminated stepping stones from spawn to the tree.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.1, 15),
      new THREE.Vector3(-2.6, 0.1, 8),
      new THREE.Vector3(1.8, 0.1, 2),
      new THREE.Vector3(-1.4, 0.1, -3),
      new THREE.Vector3(0, 0.1, -7),
    ]);
    const points = curve.getPoints(34);
    const stoneMat = new THREE.MeshStandardMaterial({
      color: '#e8e0ff',
      emissive: '#b8a8f0',
      emissiveIntensity: 0.9,
      roughness: 0.5,
    });
    points.forEach((point, i) => {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.12, 8), stoneMat);
      stone.position.copy(point);
      stone.position.y = 0.12;
      stone.rotation.y = i * 0.5;
      this.group.add(stone);
    });

    const glow = createRuneCircle({ color: '#dcd0ff', radius: 2.2, opacity: 0.22 });
    glow.position.set(0, 0.05, 15);
    this.group.add(glow);
    this.addUpdate(glow.userData.update);
  }

  _buildBook() {
    const pedestal = createPedestal({ height: 1.1, radius: 0.8, color: '#8f8aa8' });
    this.add(pedestal, { x: 4.6, z: -1.5, y: 0 });
    this.addColliderCircle(4.6, -1.5, 0.9);

    const book = new AncientBook({ sealed: false });
    book.applySealedState(false);
    book.group.position.set(4.6, 1.2, -1.5);
    book.group.rotation.y = -Math.PI / 2;
    this.group.add(book.group);
    this.book = book;
    this.addUpdate((dt) => {
      book.update(dt);
      if (book.openAmount < 1) {
        book.openAmount = Math.min(1, book.openAmount + dt * 0.5);
      }
    });

    const glow = new THREE.PointLight('#ffe3a8', 4, 8, 2);
    glow.position.set(4.6, 2, -1.5);
    this.group.add(glow);

    this.addInteractable({
      id: 'sanctuary-book',
      x: 4.6,
      z: -1.5,
      y: 1.8,
      radius: 2.8,
      prompt: 'Re-read the hidden page',
      glyph: '❧',
      action: () => this.game.secretReveal.reopen(),
    });

    this.addMarker({ x: 4.6, z: -1.5, type: 'relic', label: 'The Chronicle' });
  }

  _buildReturnGate() {
    const gate = createWaystone({ color: '#c8d8f0', height: 2.4 });
    this.add(gate, { x: 0, z: 15.2, y: this.heightAt(0, 15.2) });
    this.addUpdate(gate.userData.update);
    this.addInteractable({
      id: 'return-library',
      x: 0,
      z: 15.2,
      y: this.heightAt(0, 15.2) + 2.4,
      radius: 3,
      prompt: 'Return to the world below',
      glyph: '↩',
      action: () => this.game.returnFromEnding(),
    });
  }

  _buildAmbience() {
    const stars = createParticleField({
      count: 260,
      area: 70,
      height: 26,
      center: [0, 0, -6],
      color: '#e8e0ff',
      size: 1.2,
      speed: 0.05,
      drift: 0.25,
      swirl: 0.1,
      opacity: 0.6,
    });
    this.group.add(stars);
    this.addUpdate(stars.userData.update);
  }

  getEndingCamera() {
    return {
      center: [0, 2, -4],
      radius: 15,
      height: 4.2,
      lookHeight: 5,
      speed: 0.03,
    };
  }

  getTreeCamera() {
    return {
      position: [0.5, 4.2, 4.5],
      lookAt: [0, 3.4, -9],
    };
  }
}
