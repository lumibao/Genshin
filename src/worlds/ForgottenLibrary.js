/**
 * Chapters III and V — The Sealed Archive and the Forgotten Library.
 *
 * The archive holds the bookshelf puzzle and the sealed Unwritten Chronicle.
 * The hidden library below it is the reveal chamber: a single candlelit room,
 * a physical book on a pedestal, and nothing else competing for attention.
 */
import * as THREE from 'three';
import { BaseWorld } from './BaseWorld.js';
import {
  createArch,
  createBanner,
  createBookshelf,
  createParticleField,
  createPedestal,
  createRuneCircle,
  createWaystone,
  markShadows,
} from './WorldKit.js';
import { createNPCModel, createQuestMarker } from './NPCKit.js';
import { AncientBook } from './AncientBook.js';
import { stoneTexture, woodTexture, parchmentTexture, runeRingTexture, glowTexture } from '../game/Textures.js';

const SYMBOLS = [
  { id: 'moon', glyph: '☾', name: 'the Crescent Moon', color: '#bcd6f0' },
  { id: 'star', glyph: '✦', name: 'the North Star', color: '#f2e2b0' },
  { id: 'wind', glyph: '❖', name: 'the Wandering Wind', color: '#a9e6d6' },
];

/* ================================================================== */
/* Shared interior pieces                                              */
/* ================================================================== */

function buildRoomShell(world, { width = 36, depth = 32, height = 8.5, centerZ = -1, wallColor = '#4a4c4e', northGap = 0 } = {}) {
  const stone = new THREE.MeshStandardMaterial({
    map: stoneTexture('dark'),
    color: wallColor,
    roughness: 0.98,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    map: stoneTexture('dark'),
    color: '#565754',
    roughness: 1,
  });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, 1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, centerZ);
  floor.receiveShadow = true;
  world.group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: '#191a1c', roughness: 1, side: THREE.DoubleSide }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, height, centerZ);
  world.group.add(ceiling);

  const wallGeo = new THREE.BoxGeometry(width, height, 0.8);
  const northZ = centerZ - depth / 2;
  if (northGap > 0) {
    const sideWidth = width / 2 - northGap;
    for (const side of [-1, 1]) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(sideWidth, height, 0.8), stone);
      piece.position.set(side * (northGap + sideWidth / 2), height / 2, northZ);
      world.group.add(piece);
      world.addColliderBox(side * (northGap + sideWidth / 2), northZ, sideWidth / 2, 0.5);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(northGap * 2, height - 5.6, 0.8), stone);
    lintel.position.set(0, 5.6 + (height - 5.6) / 2, northZ);
    world.group.add(lintel);
  } else {
    const north = new THREE.Mesh(wallGeo, stone);
    north.position.set(0, height / 2, northZ);
    world.group.add(north);
    world.addColliderBox(0, northZ, width / 2, 0.5);
  }

  const south = new THREE.Mesh(wallGeo, stone);
  south.position.set(0, height / 2, centerZ + depth / 2);
  world.group.add(south);
  world.addColliderBox(0, centerZ + depth / 2, width / 2, 0.5);

  const sideGeo = new THREE.BoxGeometry(0.8, height, depth);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(sideGeo, stone);
    wall.position.set((side * width) / 2, height / 2, centerZ);
    world.group.add(wall);
    world.addColliderBox((side * width) / 2, centerZ, 0.5, depth / 2);
  }

  // Stone ribs across the ceiling.
  for (let i = -2; i <= 2; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, 0.5), stone);
    rib.position.set(0, height - 0.2, centerZ + i * 6);
    world.group.add(rib);
  }

  world.shell = { width, depth, height, centerZ, stone };
  return world.shell;
}

function addWallShelf(world, { x, z, rotation = 0, width = 5.4, height = 4.6, seed = 1, books = true }) {
  const shelf = createBookshelf({ width, height, depth: 0.75, shelves: 4, seed, withBooks: books });
  world.add(shelf, { x, z, rotation, y: 0, camera: true });
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  world.addColliderBox(x, z, (Math.abs(cos) * width) / 2 + 0.4, (Math.abs(sin) * width) / 2 + 0.5, rotation);
  return shelf;
}

function addCandle(world, x, z, height = 1.6, withLight = false, scale = 1) {
  const group = new THREE.Group();
  const wax = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055 * scale, 0.065 * scale, 0.34 * scale, 7),
    new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.8 }),
  );
  wax.position.y = 0.17 * scale;
  group.add(wax);
  const flame = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('#ffcb7a'),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  flame.position.y = 0.42 * scale;
  flame.scale.set(0.3, 0.55, 1);
  group.add(flame);
  if (withLight) {
    const light = new THREE.PointLight('#ffc27a', 3.2, 9, 2);
    light.position.y = 0.5;
    group.add(light);
  }
  group.position.set(x, height, z);
  world.group.add(group);
  world.addUpdate((dt, time) => {
    const flicker = 0.86 + Math.sin(time * 11 + x) * 0.1 + Math.sin(time * 23 + z) * 0.05;
    flame.scale.set(0.3 * flicker, 0.55 * flicker, 1);
  });
  // Tall candle stand
  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.11, height, 6),
    new THREE.MeshStandardMaterial({ color: '#4a4034', metalness: 0.6, roughness: 0.5 }),
  );
  stand.position.set(x, height / 2, z);
  world.group.add(stand);
  return group;
}

/* ================================================================== */
/* Chapter III — The Sealed Archive                                    */
/* ================================================================== */

export class SealedArchive extends BaseWorld {
  constructor(context) {
    super(context);
    this.level = 3;
    this.surface = 'stone';
    this.music = 'archive';
    this.ambience = 'archive';
    this.atmosphere = {
      fog: '#141b22',
      fogNear: 16,
      fogFar: 58,
      background: '#0b1015',
    };
    this.bounds = { x: 0, z: -2, radius: 24 };
    this.spawns = {
      default: { x: 0, z: 12.5, yaw: Math.PI },
      fromRuins: { x: 0, z: 12.5, yaw: Math.PI },
      fromObservatory: { x: -9, z: -9, yaw: Math.PI / 2 },
    };
    this.placedSymbols = {};
    this._shelfOffset = 0;
    this._shelfOpen = false;
    this._pages = [];
  }

  heightAt() {
    return 0;
  }

  async build() {
    this._buildLights();
    buildRoomShell(this, { width: 36, depth: 32, height: 8.5, centerZ: -1, northGap: 4.2 });
    this._buildShelves();
    this._buildAlcove();
    this._buildPuzzle();
    this._buildPages();
    this._buildEcho();
    this._buildPortals();
    this._buildAtmosphere();

    if (this.game.state.flags.L3_symbolsSolved) this._openShelf(true);
    this._restorePages();
    if (this.game.state.flags.L3_bookFound) this._revealBook(true);
  }

  _buildLights() {
    this.group.add(new THREE.AmbientLight('#5b6672', 0.75));
    const key = new THREE.PointLight('#ffd9a0', 12, 30, 2);
    key.position.set(0, 6, 2);
    this.group.add(key);
    const fill = new THREE.PointLight('#7fa8c0', 5, 24, 2);
    fill.position.set(-12, 4.5, -10);
    this.group.add(fill);
    const back = new THREE.PointLight('#ffbb77', 6, 18, 2);
    back.position.set(0, 3.4, -16);
    this.group.add(back);
  }

  _buildShelves() {
    // Long shelves along both side walls.
    for (let i = 0; i < 4; i++) {
      addWallShelf(this, { x: -16.8, z: -12 + i * 6, rotation: Math.PI / 2, width: 5.2, height: 4.4, seed: i + 2 });
      addWallShelf(this, { x: 16.8, z: -12 + i * 6, rotation: -Math.PI / 2, width: 5.2, height: 4.4, seed: i + 7 });
    }
    // Freestanding shelves forming a narrow aisle.
    for (const [x, z, rot, seed] of [
      [-7.5, 3.5, 0, 12],
      [7.5, 3.5, 0, 15],
      [-12.5, -6, Math.PI / 2, 18],
      [12.5, -6, Math.PI / 2, 21],
    ]) {
      addWallShelf(this, { x, z, rotation: rot, width: 5, height: 4.2, seed });
    }

    // Central reading table.
    const table = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture('dark'), roughness: 0.88 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.22, 2.6), wood);
    top.position.y = 1.05;
    table.add(top);
    for (const sx of [-2.2, 2.2]) {
      for (const sz of [-0.9, 0.9]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.04, 0.22), wood);
        leg.position.set(sx, 0.52, sz);
        table.add(leg);
      }
    }
    // Open books on the table
    for (const [x, z, rot] of [
      [-1.2, 0.2, 0.3],
      [1.4, -0.3, -0.6],
    ]) {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.07, 0.48),
        new THREE.MeshStandardMaterial({ map: parchmentTexture(), roughness: 0.9 }),
      );
      book.position.set(x, 1.2, z);
      book.rotation.y = rot;
      table.add(book);
    }
    markShadows(table);
    this.add(table, { x: 0, z: 0, y: 0, camera: true });
    this.addColliderBox(0, 0, 2.6, 1.3);

    addCandle(this, -2.4, 0.9, 1.2, true, 1.1);
    addCandle(this, 2.5, -0.8, 1.2, false, 1.1);
    addCandle(this, 0.2, 3.6, 2.2, false, 1.2);
    addCandle(this, -13.5, 9.5, 1.7, true);

    // Hanging banners.
    for (const [x, rotation] of [
      [-9, 0],
      [9, 0],
    ]) {
      const banner = createBanner({ width: 1.8, height: 4.4, hue: '#2f3d52' });
      banner.position.set(x, 6.4, -15.4);
      banner.rotation.y = rotation;
      this.group.add(banner);
    }
  }

  _buildAlcove() {
    // The concealed shelf sits in the north wall and slides aside.
    const shelf = createBookshelf({ width: 5.6, height: 5.6, depth: 0.9, shelves: 5, seed: 33 });
    shelf.position.set(0, 0, -16.2);
    this.group.add(shelf);
    this._hiddenShelf = shelf;
    this.addCameraObstacle(shelf);
    this._shelfCollider = this.addColliderBox(0, -16.2, 2.8, 0.6);
    this.addMarker({ x: 0, z: -16.2, type: 'poi', label: 'Concealed Shelf' });

    // Alcove behind it.
    const alcoveFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 7),
      new THREE.MeshStandardMaterial({ map: stoneTexture('dark'), color: '#4a4b48', roughness: 1 }),
    );
    alcoveFloor.rotation.x = -Math.PI / 2;
    alcoveFloor.position.set(0, 0.01, -19.5);
    this.group.add(alcoveFloor);

    const stone = new THREE.MeshStandardMaterial({ map: stoneTexture('dark'), color: '#424444', roughness: 1 });
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 7), stone);
      wall.position.set(side * 4, 3, -19.5);
      this.group.add(wall);
      this.addColliderBox(side * 4, -19.5, 0.4, 3.5);
    }
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(8.6, 6, 0.6), stone);
    backWall.position.set(0, 3, -23);
    this.group.add(backWall);
    this.addColliderBox(0, -23, 4.3, 0.4);

    const alcoveCeiling = new THREE.Mesh(
      new THREE.PlaneGeometry(8.6, 7),
      new THREE.MeshStandardMaterial({ color: '#17191c', roughness: 1, side: THREE.DoubleSide }),
    );
    alcoveCeiling.rotation.x = Math.PI / 2;
    alcoveCeiling.position.set(0, 6, -19.5);
    this.group.add(alcoveCeiling);

    // Arch framing the alcove.
    const arch = createArch({ width: 4.4, height: 5.2, depth: 0.8, seed: 4 });
    this.add(arch, { x: 0, z: -17.4, y: 0 });

    // Pedestal and book.
    const pedestal = createPedestal({ height: 1.25, radius: 0.9, color: '#7f7b70' });
    this.add(pedestal, { x: 0, z: -20.6, y: 0 });
    this.addColliderCircle(0, -20.6, 1.0);
    this.addMarker({ x: 0, z: -20.6, type: 'relic', label: 'The Unwritten Chronicle' });

    this.book = new AncientBook({ sealed: true });
    this.book.group.position.set(0, 1.34, -20.6);
    this.book.group.rotation.y = Math.PI;
    this.group.add(this.book.group);
    this.addUpdate((dt) => this.book.update(dt));

    const rune = createRuneCircle({ color: '#e8d6a8', radius: 2.2, opacity: 0.45 });
    rune.position.set(0, 1.36, -20.6);
    rune.rotation.x = 0;
    rune.scale.setScalar(0.9);
    this.group.add(rune);
    this.addUpdate(rune.userData.update);
    this._bookRune = rune;

    // Candles in the alcove.
    addCandle(this, -1.8, -19.4, 2.0, true);
    addCandle(this, 1.8, -19.4, 2.0, false);

    this._bookInteractable = this.addInteractable({
      id: 'chronicle',
      x: 0,
      z: -20.6,
      y: 1.9,
      radius: 3.2,
      prompt: () => (this.game.state.flags.L3_bookFound ? 'Examine The Unwritten Chronicle' : 'Examine the sealed volume'),
      glyph: '❧',
      action: () => this._examineBook(),
    });
  }

  _buildPuzzle() {
    // Three symbol pedestals.
    const positions = [
      { x: -6.5, z: -5.5 },
      { x: 0, z: -8.5 },
      { x: 6.5, z: -5.5 },
    ];
    this._pedestals = [];
    SYMBOLS.forEach((symbol, index) => {
      const pos = positions[index];
      const pedestal = createPedestal({ height: 1.0, radius: 0.6, color: '#8c887c' });
      this.add(pedestal, { x: pos.x, z: pos.z, y: 0 });
      this.addColliderCircle(pos.x, pos.z, 0.7);

      // Symbol disc floating above the pedestal.
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.34, 24),
        new THREE.MeshStandardMaterial({
          color: symbol.color,
          emissive: symbol.color,
          emissiveIntensity: 0.8,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
        }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(pos.x, 1.42, pos.z);
      this.group.add(disc);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: runeRingTexture(symbol.color),
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glow.scale.set(1.1, 1.1, 1);
      glow.position.set(pos.x, 1.2, pos.z);
      this.group.add(glow);

      this.addUpdate((dt, time) => {
        disc.rotation.z += dt * 0.3;
        disc.position.y = 1.42 + Math.sin(time * 1.2 + index) * 0.03;
      });

      this._pedestals.push({ ...symbol, disc, glow, x: pos.x, z: pos.z });

      this.addInteractable({
        id: `pedestal-${symbol.id}`,
        x: pos.x,
        z: pos.z,
        y: 1.3,
        radius: 2.5,
        prompt: `Place the page marked ${symbol.glyph}`,
        glyph: symbol.glyph,
        action: () => this._placeSymbol(symbol.id),
      });
    });

    // Matching page positions.
    this._pagePositions = [
      { x: -13.5, z: 8.5, symbol: SYMBOLS[0], height: 1.2, hint: 'candle' },
      { x: 12.8, z: -11.5, symbol: SYMBOLS[1], height: 0.9, hint: 'leaning shelf' },
      { x: 13.2, z: 8, symbol: SYMBOLS[2], height: 2.4, hint: 'low shelf' },
    ];

    // Decorative leaning shelf near page 2.
    const leaning = createBookshelf({ width: 3.2, height: 4, depth: 0.6, shelves: 3, seed: 44 });
    leaning.position.set(13.4, 0, -11.4);
    leaning.rotation.z = 0.16;
    leaning.rotation.y = -Math.PI / 2;
    this.group.add(leaning);
    this.addColliderBox(12.9, -11.4, 0.6, 1.7);
  }

  _buildPages() {
    this._pageMeshes = [];
    this._pagePositions.forEach((pos, index) => {
      const group = new THREE.Group();
      const page = new THREE.Mesh(
        new THREE.PlaneGeometry(0.58, 0.76),
        new THREE.MeshStandardMaterial({
          map: parchmentTexture(),
          color: '#f6e9c8',
          emissive: '#e2cf9f',
          emissiveIntensity: 0.5,
          side: THREE.DoubleSide,
          roughness: 0.95,
        }),
      );
      page.rotation.x = -Math.PI / 2 + 0.35;
      group.add(page);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture('#ffe9b0'),
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glow.scale.set(1.4, 1.4, 1);
      group.add(glow);

      const light = new THREE.PointLight('#ffe2a0', 1.6, 4, 2);
      group.add(light);

      group.position.set(pos.x, pos.height, pos.z);
      this.group.add(group);
      this.addUpdate((dt, time) => {
        group.rotation.y += dt * 0.4;
        group.position.y = pos.height + Math.sin(time * 1.5 + index) * 0.08;
      });

      const collected = !!this.game.state.flags[`L3_page_${pos.symbol.id}`];
      group.visible = !collected;
      this._pageMeshes.push(group);

      this.addInteractable({
        id: `page-${pos.symbol.id}`,
        x: pos.x,
        z: pos.z,
        y: pos.height,
        radius: 2.2,
        prompt: 'Recover the chronicle page',
        glyph: '❧',
        action: () => this._collectPage(index),
        enabled: () => group.visible,
        marker: 'relic',
      });
    });
  }

  _buildEcho() {
    const echo = createNPCModel({
      robeColor: '#3f4d5c',
      trimColor: '#a9c3dc',
      hairColor: '#cfd8e4',
      skinColor: '#dfe6ec',
      hood: true,
      tall: 1.04,
      seed: 12,
    });
    echo.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.62;
        child.material.emissive = new THREE.Color('#5b7f9c');
        child.material.emissiveIntensity = 0.35;
      }
    });
    this.add(echo, { x: -4.4, z: 5.2, rotation: 0.4 });
    this.addUpdate(echo.userData.update);
    const marker = createQuestMarker({ color: '#a9c3dc', offsetY: 2.3 });
    echo.add(marker);
    this.addUpdate(marker.userData.update);
    this._echoMarker = marker;

    this.addInteractable({
      id: 'echo',
      x: -4.4,
      z: 5.2,
      y: 1.4,
      radius: 3,
      prompt: 'Speak with the Archivist’s Echo',
      glyph: '✧',
      action: () => this._talkToEcho(),
      marker: 'npc',
    });

    addCandle(this, -5.6, 6.4, 1.8, false);
  }

  _buildPortals() {
    // Observatory waystone.
    const observatoryGate = createWaystone({ color: '#b8d4f0', height: 2.4, label: 'Observatory Waystone' });
    this.add(observatoryGate, { x: -10.5, z: -10.5, y: 0 });
    this.addUpdate(observatoryGate.userData.update);
    this.addColliderCircle(-10.5, -10.5, 0.8);
    this._observatoryGate = observatoryGate;
    this._observatoryGate.userData.setActive(this.game.state.completed.includes(3));

    this.addInteractable({
      id: 'observatory-gate',
      x: -10.5,
      z: -10.5,
      y: 2.6,
      radius: 3,
      prompt: () => (this.game.state.completed.includes(3) ? 'Ascend to the observatory' : 'Touch the dark waystone'),
      glyph: '✧',
      action: () => {
        if (!this.game.state.completed.includes(3)) {
          this.game.hud.toast({ icon: '✦', text: 'The waystone is dark. The archive has not given up its last page.', variant: 'hint' });
          this.game.audio.play('locked');
          return;
        }
        this.game.levels.requestTravel('observatory', 'default', { level: 4 });
      },
    });

    // The concealed stair down to the hidden library.
    const stairDoor = new THREE.Group();
    const doorMat = new THREE.MeshStandardMaterial({ map: stoneTexture('dark'), color: '#3d4144', roughness: 1 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 5.4, 0.7), doorMat);
    frame.position.set(0, 2.7, 0);
    stairDoor.add(frame);
    const seal = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.06, 6, 32),
      new THREE.MeshStandardMaterial({
        color: '#8f9bb0',
        metalness: 0.7,
        roughness: 0.4,
        emissive: '#3d4c63',
        emissiveIntensity: 0.6,
      }),
    );
    seal.position.set(0, 2.6, 0.42);
    stairDoor.add(seal);
    const runeSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: runeRingTexture('#a9c3dc'),
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    runeSprite.scale.set(2.4, 2.4, 1);
    runeSprite.position.set(0, 2.6, 0.5);
    stairDoor.add(runeSprite);
    markShadows(stairDoor);
    this.add(stairDoor, { x: 16.1, z: 0, rotation: -Math.PI / 2, y: 0, camera: true });
    this._stairDoor = stairDoor;
    this._stairRune = runeSprite;

    // Once the seal is home, the door announces itself: brighter runes, a light
    // of its own and a minimap marker, so Chapter V is never a hunt.
    if (this.game.levels.canTravelTo('hiddenLibrary').ok) {
      this._stairRune.material.opacity = 0.95;
      const stairLight = new THREE.PointLight('#cdb8ff', 6, 12, 2);
      stairLight.position.set(14.6, 2.6, 0);
      this.group.add(stairLight);
      const beacon = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture('#cbb6ff'),
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      beacon.scale.set(3.2, 3.2, 1);
      beacon.position.set(15.2, 2.6, 0);
      this.group.add(beacon);
      this.addUpdate((dt, time) => {
        beacon.material.opacity = 0.45 + Math.sin(time * 1.8) * 0.18;
      });
    }

    this.addInteractable({
      id: 'hidden-library-door',
      x: 15.2,
      z: 0,
      y: 2.4,
      radius: 3.4,
      prompt: () => (this.game.levels.canTravelTo('hiddenLibrary').ok ? 'Open the celestial stair' : 'Examine the celestial lock'),
      marker: 'poi',
      glyph: '☾',
      action: () => {
        const check = this.game.levels.canTravelTo('hiddenLibrary');
        if (!check.ok) {
          this.game.hud.toast({ icon: '☾', text: check.message, variant: 'hint' });
          this.game.audio.play('locked');
          return;
        }
        this.game.levels.requestTravel('hiddenLibrary', 'default', { level: 5 });
      },
    });

    // Back to the ruins.
    const returnGate = createWaystone({ color: '#a8c0a0', height: 2.0 });
    this.add(returnGate, { x: 8.5, z: 12.5, y: 0 });
    this.addUpdate(returnGate.userData.update);
    this.addColliderCircle(8.5, 12.5, 0.8);
    this.addInteractable({
      id: 'return-ruins',
      x: 8.5,
      z: 12.5,
      y: 2.2,
      radius: 2.8,
      prompt: 'Return to the Fallen Circle',
      glyph: '↩',
      action: () => this.game.levels.requestTravel('ancientRuins', 'fromArchive', { level: 2 }),
    });

    // Entrance stair visual.
    const entry = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(5 - i * 0.1, 0.24, 0.9),
        new THREE.MeshStandardMaterial({ map: stoneTexture('dark'), color: '#585a56', roughness: 1 }),
      );
      step.position.set(0, 0.12 + i * 0.24, 14.4 - i * 0.9);
      entry.add(step);
    }
    this.group.add(entry);

    // Archive ledger, readable.
    const lectern = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture('dark'), roughness: 0.9 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.2, 6), wood);
    post.position.y = 0.6;
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.9), wood);
    desk.position.y = 1.24;
    desk.rotation.x = -0.28;
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.09, 0.66),
      new THREE.MeshStandardMaterial({ map: parchmentTexture(), roughness: 0.9 }),
    );
    book.position.set(0, 1.32, 0);
    book.rotation.x = -0.28;
    lectern.add(post, desk, book);
    markShadows(lectern);
    this.add(lectern, { x: 3.2, z: 7.5, rotation: 0.4, y: 0 });
    this.addColliderCircle(3.2, 7.5, 0.6);
    this.addInteractable({
      id: 'archive-ledger',
      x: 3.2,
      z: 7.5,
      y: 1.4,
      radius: 2.4,
      prompt: 'Read the archive ledger',
      glyph: '✎',
      action: () => this.game.openLore('archiveLedger'),
    });
  }

  _buildAtmosphere() {
    const dust = createParticleField({
      count: 180,
      area: 30,
      height: 8,
      center: [0, 0, -2],
      color: '#e8dcc4',
      size: 1.2,
      speed: 0.08,
      drift: 0.35,
      swirl: 0.2,
      opacity: 0.4,
    });
    this.group.add(dust);
    this.addUpdate(dust.userData.update);

    const motes = createParticleField({
      count: 60,
      area: 20,
      height: 6,
      center: [0, 0, -16],
      color: '#ffe3a8',
      size: 1.6,
      speed: 0.12,
      drift: 0.4,
      swirl: 0.2,
      opacity: 0.5,
    });
    this.group.add(motes);
    this.addUpdate(motes.userData.update);
  }

  _restorePages() {
    for (const symbol of SYMBOLS) {
      if (this.game.state.flags[`L3_placed_${symbol.id}`]) {
        this.placedSymbols[symbol.id] = true;
      }
    }
  }

  async _talkToEcho() {
    const flags = this.game.state.flags;
    if (flags.L3_bookFound) {
      await this.game.dialogue.play('echo.book');
      return;
    }
    if (this.game.inventory.count('chroniclePage') >= 3) {
      await this.game.dialogue.play('echo.symbols');
      this._echoMarker?.userData.setVisible(false);
      return;
    }
    if (this.game.inventory.count('chroniclePage') > 0) {
      await this.game.dialogue.play('echo.hint');
      return;
    }
    await this.game.dialogue.play('echo.first');
    this._echoMarker?.userData.setVisible(false);
    this.game.quests.setFlag('L3_talkedEcho', true);
  }

  _collectPage(index) {
    const pos = this._pagePositions[index];
    const mesh = this._pageMeshes[index];
    if (!mesh.visible) return;
    mesh.visible = false;
    this.game.quests.setFlag(`L3_page_${pos.symbol.id}`, true);
    this.game.inventory.add('chroniclePage', 1);
    this.game.audio.play('page');
    this.game.cinematics.flashScreen('#ffeec4', 380);
    this.game.hud.toast({
      icon: pos.symbol.glyph,
      kicker: 'Chronicle Page',
      text: `Marked with ${pos.symbol.name}`,
      detail: `${this.game.inventory.count('chroniclePage')} of 3 recovered`,
      variant: 'item',
    });
    this.game.hud.toast({
      icon: '✧',
      text: 'The mark matches one of the archive pedestals.',
      variant: 'hint',
    });
    if (this.game.inventory.count('chroniclePage') >= 3) {
      this.game.quests.setFlag('L3_allPages', true);
    }
  }

  _placeSymbol(symbolId) {
    if (this.placedSymbols[symbolId]) {
      this.game.hud.toast({ icon: '✦', text: 'This pedestal already holds its page.', variant: 'hint' });
      return;
    }
    if (!this.game.state.flags[`L3_page_${symbolId}`]) {
      this.game.audio.play('locked');
      this.game.hud.toast({
        icon: '✦',
        text: 'The engraving answers nothing. The matching page is still hidden in the archive.',
        variant: 'hint',
      });
      return;
    }
    this.placedSymbols[symbolId] = true;
    this.game.quests.setFlag(`L3_placed_${symbolId}`, true);
    this.game.audio.play('mechanism');
    this.game.cinematics.flashScreen('#ffeac0', 320);
    const placedCount = Object.keys(this.placedSymbols).length;
    this.game.hud.toast({
      icon: '✧',
      text: `The ${SYMBOLS.find((s) => s.id === symbolId)?.name || 'symbol'} settles into place (${placedCount}/3).`,
      variant: 'hint',
    });
    if (placedCount >= 3) {
      this.game.quests.setFlag('L3_symbolsSolved', true);
      this._openShelf();
    }
  }

  _openShelf(instant = false) {
    if (this._shelfOpen) return;
    this._shelfOpen = true;
    if (this._shelfCollider) this._shelfCollider.disabled = true;
    this.game.quests.setFlag('L3_bookshelfUnlocked', true);
    this.game.audio.play('unlock');
    this.game.cameraController.shake(0.14, 0.7);
    this.game.cinematics.flashScreen('#ffe9b8', 700);
    this.game.hud.toast({
      icon: '✦',
      kicker: 'Shelf Unlocked',
      text: 'The concealed shelf slides aside.',
      variant: 'quest',
    });

    const target = 6.2;
    this.addUpdate((dt) => {
      if (instant) {
        this._shelfOffset = target;
      } else {
        this._shelfOffset = Math.min(target, this._shelfOffset + dt * 1.6);
      }
      this._hiddenShelf.position.x = this._shelfOffset;
    });
    if (instant) {
      this._shelfOffset = target;
      this._hiddenShelf.position.x = target;
    }
  }

  async _examineBook() {
    if (!this.game.state.flags.L3_bookshelfUnlocked) {
      this.game.hud.toast({ icon: '✦', text: 'The book waits behind a shelf that has not opened.', variant: 'hint' });
      return;
    }
    if (!this.game.state.flags.L3_bookFound) {
      await this.game.dialogue.play('echo.book');
      this.game.quests.setFlag('L3_bookFound', true);
      this.game.cinematics.flashScreen('#ffe9b8', 800);
      this.game.hud.toast({
        icon: '❧',
        kicker: 'The Unwritten Chronicle',
        text: 'A silver seal holds the cover shut.',
        detail: 'The cover answers only to a celestial seal.',
        variant: 'quest',
      });
      this._revealBook();
      return;
    }
    this.game.openLore('chronicle', 'The Unwritten Chronicle', [
      'The cover is sealed with a thin band of starlight. It does not yield to force, and it does not answer to your hands yet.',
      'Something is missing — something kept above the clouds, where the sky can be read.',
    ]);
  }

  _revealBook(instant = false) {
    if (this._bookRevealed) return;
    this._bookRevealed = true;
    const glow = new THREE.PointLight('#ffe0a0', 5, 9, 2);
    glow.position.set(0, 2.4, -20.6);
    this.group.add(glow);
    this.addUpdate((dt, time) => {
      glow.intensity = 4 + Math.sin(time * 1.8) * 1.2;
    });
    if (!instant) this.game.cameraController.shake(0.06, 0.4);
  }

  onLevelComplete(levelId) {
    if (levelId === 3) {
      this._observatoryGate?.userData.setActive(true);
      this.game.hud.toast({
        icon: '✧',
        kicker: 'Path Opened',
        text: 'The observatory waystone has woken.',
        variant: 'quest',
      });
      this.addMarker({ x: -10.5, z: -10.5, type: 'gate', label: 'Observatory Waystone', id: 'observatory-gate-active' });
    }
    if (levelId === 4) {
      this._stairRune.material.opacity = 0.95;
      this.game.hud.toast({
        icon: '☾',
        kicker: 'The Stair Opens',
        text: 'The celestial lock on the eastern wall has turned.',
        variant: 'quest',
      });
      this.addMarker({ x: 15.2, z: 0, type: 'gate', label: 'Celestial Stair', id: 'hidden-library-active' });
    }
  }

  /** First frame reminder if the player arrives before the archive is solved. */
  onEnter() {
    if (!this.game.state.flags.L3_bookshelfUnlocked && this.game.state.level === 3) {
      this.game.hud.toast({ icon: '✦', text: 'Three pages are missing from the chronicle shelf.', variant: 'hint' });
    }
  }
}

/* ================================================================== */
/* Chapter V — The Forgotten Library                                   */
/* ================================================================== */

export class HiddenLibrary extends BaseWorld {
  constructor(context) {
    super(context);
    this.level = 5;
    this.surface = 'stone';
    this.music = 'library';
    this.ambience = 'library';
    this.atmosphere = {
      fog: '#1b140e',
      fogNear: 12,
      fogFar: 52,
      background: '#0a0705',
    };
    this.bounds = { x: 0, z: -2, radius: 22 };
    this.spawns = {
      default: { x: 0, z: 13, yaw: Math.PI },
      fromArchive: { x: 0, z: 13, yaw: Math.PI },
    };
    this._pedestalReached = false;
    this._gateOpen = false;
  }

  /**
   * The central dais is a real step, not a wall.
   *
   * It used to have a 4.5-radius collider, which meant a player could get no
   * closer than 4.92 to the pedestal — outside both the 4.2 "approach" trigger
   * and the 3.2 book interaction radius. Chapter V therefore could not be
   * finished on foot at all. The dais is 0.32 high, so the terrain sampler
   * lifts the player onto it instead.
   */
  heightAt(x = 0, z = 0) {
    const DAIS_TOP = 0.32;
    const dist = Math.hypot(x, z + 6);
    if (dist <= 4.4) return DAIS_TOP;
    if (dist < 5.4) return DAIS_TOP * (1 - (dist - 4.4));
    return 0;
  }

  async build() {
    this._buildLights();
    buildRoomShell(this, { width: 38, depth: 34, height: 11, centerZ: -2, wallColor: '#4a4038', northGap: 2.8 });
    this._buildGreatShelves();
    this._buildCenterpiece();
    this._buildCandles();
    this._buildExit();
    this._buildAtmosphere();
    this._restoreState();
  }

  _buildLights() {
    this.group.add(new THREE.AmbientLight('#6b5a48', 0.62));
    const central = new THREE.PointLight('#ffd39a', 16, 26, 2);
    central.position.set(0, 6.5, -4);
    this.group.add(central);
    this._centralLight = central;

    const warm = new THREE.PointLight('#ffb877', 9, 18, 2);
    warm.position.set(0, 3.2, -7);
    this.group.add(warm);

    const cool = new THREE.PointLight('#7fa0c0', 4, 20, 2);
    cool.position.set(-14, 5, 8);
    this.group.add(cool);

    // Soft shaft of light from an unseen oculus.
    const shaft = new THREE.Mesh(
      new THREE.ConeGeometry(6.5, 16, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#ffe1a8',
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    shaft.position.set(0, 9, -8);
    shaft.rotation.x = Math.PI;
    this.group.add(shaft);
  }

  _buildGreatShelves() {
    // Towering shelves, stacked in two tiers to imply height.
    const addTower = (x, z, rotation, width, seed) => {
      const lower = createBookshelf({ width, height: 7.4, depth: 1.0, shelves: 7, seed, withBooks: true });
      this.add(lower, { x, z, rotation, y: 0, camera: true });
      const upper = createBookshelf({ width: width * 0.92, height: 4.2, depth: 0.9, shelves: 4, seed: seed + 3, withBooks: true });
      upper.position.set(x, 7.4, z);
      upper.rotation.y = rotation;
      this.group.add(upper);
      const cos = Math.abs(Math.cos(rotation));
      const sin = Math.abs(Math.sin(rotation));
      this.addColliderBox(x, z, (cos * width) / 2 + 0.4, (sin * width) / 2 + 0.55, rotation);
    };

    for (let i = 0; i < 4; i++) {
      addTower(-17.6, -14 + i * 8, Math.PI / 2, 6.4, 60 + i);
      addTower(17.6, -14 + i * 8, -Math.PI / 2, 6.4, 70 + i);
    }
    addTower(-8.5, -16.4, 0, 6.2, 81);
    addTower(8.5, -16.4, 0, 6.2, 82);
    addTower(-13.5, 15.5, Math.PI, 5.6, 83);
    addTower(13.5, 15.5, Math.PI, 5.6, 84);

    // Rolling ladder leaning against the east shelves.
    const ladder = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture('dark'), roughness: 0.9 });
    for (const offset of [-0.42, 0.42]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 7.6, 0.1), wood);
      rail.position.set(offset, 3.8, 0);
      ladder.add(rail);
    }
    for (let i = 0; i < 11; i++) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.07, 0.07), wood);
      rung.position.set(0, 0.6 + i * 0.66, 0);
      ladder.add(rung);
    }
    ladder.position.set(15.2, 0, 4.4);
    ladder.rotation.z = -0.06;
    this.group.add(ladder);

    // Stone arches framing the room.
    for (const z of [2, -6, -14]) {
      const arch = createArch({ width: 9.5, height: 8.4, depth: 0.9, seed: z + 10 });
      this.add(arch, { x: 0, z, y: 0 });
      this.addColliderBox(-4.75, z, 0.7, 0.7);
      this.addColliderBox(4.75, z, 0.7, 0.7);
    }

    // Rug / path toward the pedestal.
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 22),
      new THREE.MeshStandardMaterial({ color: '#5a2f2a', roughness: 0.98 }),
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.02, 2);
    this.group.add(path);

    for (const [x, z, hue] of [
      [-16.5, 2.5, '#3b2b46'],
      [16.5, -6.5, '#42302a'],
    ]) {
      const banner = createBanner({ width: 2.2, height: 6, hue });
      banner.position.set(x, 8.4, z);
      banner.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.group.add(banner);
    }
  }

  _buildCenterpiece() {
    // Low dais.
    const daisMat = new THREE.MeshStandardMaterial({ map: stoneTexture('dark'), color: '#6a6258', roughness: 0.95 });
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.8, 0.32, 16), daisMat);
    dais.position.set(0, 0.16, -6);
    dais.receiveShadow = true;
    this.group.add(dais);
    // No collider: the dais is walkable terrain (see heightAt). Only the
    // pedestal itself blocks.
    this.addColliderCircle(0, -6, 1.1);

    const pedestal = createPedestal({ height: 1.3, radius: 1.0, color: '#8f8577' });
    this.add(pedestal, { x: 0, z: -6, y: 0.32 });

    // Glow beneath the book.
    const glowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 28),
      new THREE.MeshBasicMaterial({
        map: glowTexture('#ffd89a'),
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glowDisc.rotation.x = -Math.PI / 2;
    glowDisc.position.set(0, 0.66, -6);
    this.group.add(glowDisc);

    this.book = new AncientBook({ sealed: true });
    this.book.group.position.set(0, 1.68, -6);
    this.book.group.rotation.y = Math.PI;
    this.group.add(this.book.group);
    this.addUpdate((dt) => this.book.update(dt));
    this.bookRoot = this.book.group;

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture('#ffe2ab'),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.position.set(0, 2.1, -6);
    halo.scale.set(4.4, 4.4, 1);
    this.group.add(halo);
    this.addUpdate((dt, time) => {
      halo.material.opacity = 0.32 + Math.sin(time * 1.3) * 0.1;
    });

    addCandle(this, -1.9, -5.2, 1.9, true, 1.2);
    addCandle(this, 1.9, -5.2, 1.9, false, 1.2);

    this._bookInteractable = this.addInteractable({
      id: 'unwritten-chronicle',
      x: 0,
      z: -6,
      y: 2.2,
      radius: 3.2,
      prompt: () => (this.game.state.discoveredPage ? 'Open the chronicle again' : 'Open The Unwritten Chronicle'),
      glyph: '❧',
      action: () => {
        if (this.game.state.discoveredPage) {
          this.game.secretReveal.reopen();
        } else {
          this.game.secretReveal.begin();
        }
      },
    });

    // Inscription above the pedestal.
    const inscription = new THREE.Mesh(
      new THREE.PlaneGeometry(6.2, 2.2),
      new THREE.MeshStandardMaterial({
        map: this._makeInscriptionTexture(),
        transparent: true,
        roughness: 0.9,
        emissive: '#3b2a18',
        emissiveIntensity: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    inscription.position.set(0, 8.4, -19.4);
    this.group.add(inscription);

    this.addInteractable({
      id: 'library-inscription',
      x: 0,
      z: -16.5,
      y: 2,
      radius: 3.4,
      prompt: 'Read the inscription above the pedestal',
      glyph: '✎',
      action: () => this.game.openLore('libraryInscription'),
    });

    // Proximity flag for the quest.
    this.addUpdate(() => {
      if (this._pedestalReached) return;
      const player = this.game.player;
      if (!player) return;
      if (Math.hypot(player.position.x - 0, player.position.z + 6) < 5.2) {
        this._pedestalReached = true;
        this.game.quests.setFlag('L5_pedestalReached', true);
        this.game.hud.toast({
          icon: '❧',
          kicker: 'The Chronicle That Remained',
          text: 'The book is open on the pedestal, waiting.',
          variant: 'quest',
        });
      }
    });

    this.addMarker({ x: 0, z: -6, type: 'relic', label: 'The Unwritten Chronicle' });
  }

  _makeInscriptionTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 1024, 360);
    ctx.fillStyle = 'rgba(28, 20, 14, 0.55)';
    ctx.fillRect(0, 0, 1024, 360);
    ctx.strokeStyle = 'rgba(226, 192, 128, 0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, 988, 324);
    ctx.fillStyle = '#e6cfa0';
    ctx.font = 'italic 40px "Cormorant Garamond", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('This room was not built to keep books.', 512, 140);
    ctx.fillText('It was built to keep an answer.', 512, 200);
    ctx.font = '22px "Cinzel", Georgia, serif';
    ctx.fillStyle = 'rgba(230, 207, 160, 0.7)';
    ctx.fillText('✦  THE LAMPS ARE LIT  ✦', 512, 274);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  _buildCandles() {
    const spots = [
      [-9, 6],
      [9, 6],
      [-12, -10],
      [12, -10],
      [-6, 12],
      [6, 12],
      [0, -13.5],
    ];
    spots.forEach(([x, z], i) => addCandle(this, x, z, 2.1 + (i % 2) * 0.4, i < 2, 1.3));

    // A ring of small candles around the dais.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      addCandle(this, Math.cos(a) * 3.2, -6 + Math.sin(a) * 3.2, 0.34, false, 0.9);
    }
  }

  _buildExit() {
    // A stone doorway at the far end, sealed until the page is read.
    const doorGroup = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ map: stoneTexture('dark'), color: '#5a5045', roughness: 1 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.4, 7, 1), stone);
    frame.position.set(0, 3.5, 0);
    doorGroup.add(frame);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(4, 6, 0.5),
      new THREE.MeshStandardMaterial({ color: '#2c2620', roughness: 0.9 }),
    );
    door.position.set(0, 3, 0.35);
    doorGroup.add(door);
    this._exitDoor = door;
    markShadows(doorGroup);
    this.add(doorGroup, { x: 0, z: -19.2, y: 0, camera: true });
    this.addColliderBox(0, -19.2, 2.7, 0.6);

    // Door light appears after the reveal.
    this._exitGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture('#ffe3a6'),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this._exitGlow.position.set(0, 3.2, -18.8);
    this._exitGlow.scale.set(5, 6, 1);
    this.group.add(this._exitGlow);

    this._exitInteractable = this.addInteractable({
      id: 'sanctuary-gate',
      x: 0,
      z: -18.4,
      y: 2.4,
      radius: 3,
      prompt: 'Step into the light',
      glyph: '✧',
      action: () => {
        const check = this.game.levels.canTravelTo('sanctuary');
        if (!check.ok) {
          this.game.hud.toast({ icon: '✦', text: check.message, variant: 'hint' });
          return;
        }
        this.game.startEnding();
      },
      enabled: () => this.game.state.discoveredPage,
    });

    this.addMarker({ x: 0, z: -19.2, type: 'gate', label: 'The Light Beyond' });
  }

  _buildAtmosphere() {
    const motes = createParticleField({
      count: 240,
      area: 30,
      height: 10,
      center: [0, 0, -4],
      color: '#ffdda4',
      size: 1.5,
      speed: 0.1,
      drift: 0.5,
      swirl: 0.3,
      opacity: 0.62,
    });
    this.group.add(motes);
    this.addUpdate(motes.userData.update);

    const dust = createParticleField({
      count: 140,
      area: 34,
      height: 11,
      center: [0, 0, -2],
      color: '#d8c8b0',
      size: 1.1,
      speed: 0.06,
      drift: 0.3,
      swirl: 0.15,
      opacity: 0.32,
    });
    this.group.add(dust);
    this.addUpdate(dust.userData.update);

    // Slow candle shimmer on the central light.
    this.addUpdate((dt, time) => {
      if (this._centralLight) this._centralLight.intensity = 15 + Math.sin(time * 1.7) * 1.2;
    });
  }

  _restoreState() {
    if (this.game.state.discoveredPage) {
      this._openExit(true);
      this.book.applySealedState(false);
    }
  }

  _openExit(instant = false) {
    if (this._gateOpen) return;
    this._gateOpen = true;
    this._exitGlow.material.opacity = 0.85;
    this._exitGlow.visible = true;
    const target = 6.2;
    this.addUpdate((dt) => {
      const door = this._exitDoor;
      if (!door) return;
      if (instant) door.position.y = target;
      else door.position.y = Math.min(target, door.position.y + dt * 0.8);
    });
    if (instant) this._exitDoor.position.y = target;
  }

  /** Called by SecretReveal once the hidden page has been read. */
  onRevealComplete() {
    this._openExit();
    this.game.hud.toast({
      icon: '✧',
      kicker: 'A Door of Light',
      text: 'A way has opened at the far end of the library.',
      variant: 'quest',
    });
    // Book interaction should replay the page rather than start over.
    const marker = this.markers.find((m) => m.type === 'gate');
    if (marker) marker.active = true;
  }
}
