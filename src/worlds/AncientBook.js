/**
 * The Unwritten Chronicle — a physically constructed Three.js book.
 *
 * Construction notes:
 *  · Covers are solid leather slabs with real thickness and gold corner pieces.
 *  · Spine is a curved cylinder that the back cover and page block tuck into.
 *  · The front cover is parented to a pivot placed exactly on the spine, so it
 *    swings like a lid instead of rotating around its own centre.
 *  · The page block is a stack of individual sheets with slightly varied
 *    parchment tones, visible page edges and a faint curve.
 *  · A gold seal sits over the fore-edge while the book is locked; it breaks
 *    apart when the reveal gate opens.
 *  · Warm light and motes rise out of the gutter as the cover opens.
 */
import * as THREE from 'three';
import {
  bookLeatherTexture,
  glowTexture,
  metalTexture,
  pageEdgeTexture,
  parchmentTexture,
  runeRingTexture,
  sparkleTexture,
} from '../game/Textures.js';

const COVER_W = 1.62;
const COVER_D = 2.12;
const COVER_T = 0.085;
const PAGE_W = 1.44;
const PAGE_D = 1.94;
const PAGE_STACK = 0.26;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class AncientBook {
  constructor({ sealed = true } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'AncientBook';
    this.sealed = sealed;
    this.openAmount = 0;
    this.targetOpen = 0;
    this.openDuration = 2.4;
    this._opening = null;
    this._resolveOpen = null;
    this.particles = null;
    this.time = 0;
    this._build();
  }

  _build() {
    const leather = new THREE.MeshStandardMaterial({
      map: bookLeatherTexture(),
      color: '#ffffff',
      roughness: 0.78,
      metalness: 0.12,
    });
    const leatherBack = leather.clone();
    leatherBack.color = new THREE.Color('#c8c0b0');
    const gold = new THREE.MeshStandardMaterial({
      map: metalTexture('#c9a96a'),
      color: '#e7cd94',
      metalness: 0.95,
      roughness: 0.28,
    });
    const parchment = new THREE.MeshStandardMaterial({
      map: parchmentTexture(),
      color: '#f6ecd2',
      roughness: 0.94,
      metalness: 0,
    });
    const pageEdge = new THREE.MeshStandardMaterial({
      map: pageEdgeTexture(),
      color: '#f0e2c2',
      roughness: 0.96,
    });
    this.materials = { leather, leatherBack, gold, parchment, pageEdge };

    const root = new THREE.Group();
    this.root = root;
    this.group.add(root);

    /* ---------------- Back cover ---------------- */
    const backCover = new THREE.Mesh(new THREE.BoxGeometry(COVER_W, COVER_T, COVER_D), leatherBack);
    backCover.position.set(0, 0, 0);
    root.add(backCover);

    const backInset = new THREE.Mesh(
      new THREE.BoxGeometry(COVER_W - 0.16, 0.02, COVER_D - 0.16),
      gold,
    );
    backInset.position.y = COVER_T / 2 + 0.005;
    backInset.visible = false;
    root.add(backInset);

    /* ---------------- Spine ---------------- */
    const spine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, COVER_D, 18, 1, false, Math.PI * 0.55, Math.PI * 0.9),
      leather,
    );
    spine.rotation.x = Math.PI / 2;
    spine.rotation.z = Math.PI;
    spine.position.set(-COVER_W / 2 + 0.015, COVER_T / 2, 0);
    root.add(spine);

    for (const y of [-0.75, 0.75]) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.108, 0.016, 5, 16, Math.PI * 1.1),
        gold,
      );
      band.rotation.y = Math.PI / 2;
      band.rotation.z = Math.PI;
      band.position.set(-COVER_W / 2 + 0.015, COVER_T / 2, y);
      root.add(band);
    }

    /* ---------------- Page block ---------------- */
    const pageBlock = new THREE.Group();
    root.add(pageBlock);
    this.pageBlock = pageBlock;

    const blockGeo = new THREE.BoxGeometry(PAGE_W, PAGE_STACK, PAGE_D);
    const blockMats = [
      pageEdge,
      pageEdge,
      parchment,
      pageEdge,
      pageEdge,
      pageEdge,
    ];
    const block = new THREE.Mesh(blockGeo, blockMats);
    block.position.set(0.035, COVER_T / 2 + PAGE_STACK / 2, 0);
    pageBlock.add(block);

    // Individual top sheets so the edge reads as paper, not plastic.
    const sheetGeo = new THREE.PlaneGeometry(PAGE_W * 0.985, PAGE_D * 0.985);
    for (let i = 0; i < 9; i++) {
      const sheet = new THREE.Mesh(
        sheetGeo,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color('#f3e6c6').offsetHSL(0, 0, (i % 3) * 0.012),
          roughness: 0.96,
          side: THREE.DoubleSide,
        }),
      );
      sheet.rotation.x = -Math.PI / 2;
      sheet.position.set(
        0.035 + (i % 2 ? 0.006 : -0.004),
        COVER_T / 2 + PAGE_STACK + 0.002 + i * 0.0022,
        0,
      );
      sheet.rotation.z = (i % 2 ? 1 : -1) * 0.0018;
      pageBlock.add(sheet);
    }

    // Gilded fore-edge.
    const foreEdge = new THREE.Mesh(new THREE.BoxGeometry(0.02, PAGE_STACK + 0.01, PAGE_D - 0.02), gold);
    foreEdge.position.set(0.035 + PAGE_W / 2, COVER_T / 2 + PAGE_STACK / 2, 0);
    pageBlock.add(foreEdge);

    /* ---------------- Front cover (hinged on the spine) ---------------- */
    const coverPivot = new THREE.Group();
    coverPivot.position.set(-COVER_W / 2, COVER_T / 2 + PAGE_STACK + 0.01, 0);
    root.add(coverPivot);
    this.coverPivot = coverPivot;

    const frontCover = new THREE.Mesh(new THREE.BoxGeometry(COVER_W + 0.04, COVER_T, COVER_D + 0.04), leather);
    frontCover.position.set(COVER_W / 2, COVER_T / 2, 0);
    coverPivot.add(frontCover);

    // Gold corner caps.
    const cornerGeo = new THREE.BoxGeometry(0.19, 0.022, 0.19);
    for (const sx of [0.12, 1.5]) {
      for (const sz of [-0.94, 0.94]) {
        const corner = new THREE.Mesh(cornerGeo, gold);
        corner.position.set(sx, COVER_T + 0.008, sz);
        corner.rotation.y = Math.PI / 4;
        coverPivot.add(corner);
      }
    }

    // Embossed emblem on the front cover.
    const emblem = new THREE.Group();
    emblem.position.set(COVER_W / 2, COVER_T + 0.012, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.014, 5, 32), gold);
    ring.rotation.x = Math.PI / 2;
    emblem.add(ring);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.009, 4, 24), gold);
    innerRing.rotation.x = Math.PI / 2;
    emblem.add(innerRing);
    for (let i = 0; i < 4; i++) {
      const ray = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.16, 4), gold);
      const a = (i / 4) * Math.PI * 2;
      ray.position.set(Math.cos(a) * 0.11, 0.002, Math.sin(a) * 0.11);
      ray.rotation.z = Math.PI / 2;
      ray.rotation.y = -a;
      ray.rotation.x = Math.PI / 2;
      emblem.add(ray);
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), gold);
    core.position.y = 0.008;
    emblem.add(core);
    coverPivot.add(emblem);

    // Hinge strip.
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.07, COVER_T + 0.01, COVER_D), leather);
    hinge.position.set(0.02, COVER_T / 2, 0);
    coverPivot.add(hinge);

    /* ---------------- Clasp & seal ---------------- */
    const clasp = new THREE.Group();
    clasp.position.set(COVER_W / 2 + 0.01, COVER_T / 2 + PAGE_STACK / 2 + 0.02, 0);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, PAGE_STACK + 0.16, 0.16), leather);
    clasp.add(strap);
    const buckle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 5, 14), gold);
    buckle.rotation.y = Math.PI / 2;
    clasp.add(buckle);
    root.add(clasp);
    this.clasp = clasp;

    const seal = new THREE.Group();
    seal.position.set(0.035, COVER_T / 2 + PAGE_STACK + 0.035, 0);
    const sealRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.018, 5, 32),
      new THREE.MeshStandardMaterial({
        color: '#e7cd94',
        emissive: '#a8853c',
        emissiveIntensity: 1.2,
        metalness: 0.9,
        roughness: 0.25,
      }),
    );
    sealRing.rotation.x = Math.PI / 2;
    seal.add(sealRing);

    const sealDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.225, 28),
      new THREE.MeshBasicMaterial({
        map: runeRingTexture('#f6e3ac'),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    sealDisc.rotation.x = -Math.PI / 2;
    sealDisc.position.y = 0.004;
    seal.add(sealDisc);

    const sealGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture('#ffe9b0'),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    sealGlow.scale.set(1.4, 1.4, 1);
    sealGlow.position.y = 0.06;
    seal.add(sealGlow);
    root.add(seal);
    this.seal = seal;
    this.sealRing = sealRing;

    /* ---------------- Hidden page ---------------- */
    const hiddenPage = new THREE.Mesh(
      new THREE.PlaneGeometry(PAGE_W * 0.93, PAGE_D * 0.92),
      new THREE.MeshStandardMaterial({
        map: parchmentTexture(),
        color: '#fff4d8',
        emissive: '#ffcf7d',
        emissiveIntensity: 0.0,
        roughness: 0.9,
        side: THREE.DoubleSide,
      }),
    );
    hiddenPage.rotation.x = -Math.PI / 2;
    hiddenPage.position.set(0.035, COVER_T / 2 + PAGE_STACK + 0.075, 0);
    hiddenPage.visible = false;
    root.add(hiddenPage);
    this.hiddenPage = hiddenPage;

    // Decorative gold frame on the hidden page.
    const frame = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({
      color: '#c8a25c',
      emissive: '#c8953c',
      emissiveIntensity: 0.6,
      metalness: 0.7,
      roughness: 0.35,
    });
    for (const [x, z, w, d] of [
      [0, -PAGE_D * 0.4, PAGE_W * 0.8, 0.012],
      [0, PAGE_D * 0.4, PAGE_W * 0.8, 0.012],
    ]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, d), frameMat);
      line.position.set(x, COVER_T / 2 + PAGE_STACK + 0.078, z);
      frame.add(line);
    }
    for (const x of [-PAGE_W * 0.42, PAGE_W * 0.42]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, PAGE_D * 0.8), frameMat);
      line.position.set(x, COVER_T / 2 + PAGE_STACK + 0.078, 0);
      frame.add(line);
    }
    frame.visible = false;
    root.add(frame);
    this.pageFrame = frame;

    /* ---------------- Light & motes ---------------- */
    this.light = new THREE.PointLight('#ffd79a', 0, 7, 2);
    this.light.position.set(0, 0.8, 0);
    root.add(this.light);

    this.pageLight = new THREE.PointLight('#ffe6b0', 0, 3.6, 2);
    this.pageLight.position.set(0, 0.45, 0);
    root.add(this.pageLight);

    this._buildMotes();

    /* ---------------- Shadow blob ---------------- */
    this.root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = false;
      }
    });

    this.applySealedState(this.sealed);
  }

  _buildMotes() {
    const count = 70;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 1.4;
      positions[i * 3 + 1] = Math.random() * 1.6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.8;
      seeds[i] = Math.random();
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color('#ffe7ae') },
        uTexture: { value: glowTexture('#ffe7ae') },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float life = mod(uTime * (0.16 + aSeed * 0.2) + aSeed * 3.0, 1.0);
          p.y = life * 2.4;
          p.x += sin(uTime * 0.6 + aSeed * 20.0) * 0.18 * life;
          p.z += cos(uTime * 0.5 + aSeed * 17.0) * 0.2 * life;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (5.0 + aSeed * 9.0) * uPixelRatio * (6.0 / max(-mv.z, 1.0));
          vAlpha = sin(life * 3.1415) * 0.9;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform sampler2D uTexture;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          gl_FragColor = vec4(uColor, 1.0) * tex * vAlpha * uOpacity;
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    this.particles.frustumCulled = false;
    this.group.add(this.particles);
  }

  applySealedState(sealed) {
    this.sealed = sealed;
    this.seal.visible = sealed;
    if (!sealed) {
      this.hiddenPage.visible = true;
      this.pageFrame.visible = true;
    }
  }

  /** Open the book; resolves when the cover has settled. */
  open() {
    if (this.targetOpen === 1) return this._opening || Promise.resolve();
    this.targetOpen = 1;
    this.sealed = false;
    this.seal.visible = false;
    this.hiddenPage.visible = true;
    this.pageFrame.visible = true;
    this._opening = new Promise((resolve) => {
      this._resolveOpen = resolve;
    });
    this._openingStart = this.openAmount;
    return this._opening;
  }

  close() {
    this.targetOpen = 0;
    this._resolveOpen = null;
    this._opening = null;
  }

  /** Called by the reveal sequence when the seal shatters. */
  breakSeal() {
    if (!this.sealed) return;
    this.sealed = false;
    this.seal.visible = false;
    this.emitSealBurst?.();
  }

  get isOpen() {
    return this.openAmount > 0.92;
  }

  /** World-space camera framing for the close-up. */
  getCinematicCamera({ side = 1 } = {}) {
    const pos = new THREE.Vector3();
    this.group.getWorldPosition(pos);
    const quat = new THREE.Quaternion();
    this.group.getWorldQuaternion(quat);
    const offset = new THREE.Vector3(0.35 * side, 1.55, 1.75).applyQuaternion(quat);
    const lookAt = new THREE.Vector3(0.05, 0.4, 0).applyQuaternion(quat).add(pos);
    return {
      position: [pos.x + offset.x, pos.y + offset.y, pos.z + offset.z],
      lookAt: [lookAt.x, lookAt.y, lookAt.z],
    };
  }

  update(dt) {
    this.time += dt;

    if (this.openAmount !== this.targetOpen) {
      const speed = dt / this.openDuration;
      if (this.targetOpen > this.openAmount) {
        this.openAmount = Math.min(1, this.openAmount + speed);
      } else {
        this.openAmount = Math.max(0, this.openAmount - speed);
      }
      if (this.openAmount >= 1 && this._resolveOpen) {
        this._resolveOpen();
        this._resolveOpen = null;
        this._opening = null;
      }
    }

    const eased = easeInOutCubic(this.openAmount);
    // Negative rotation lifts the right-hand edge and swings it left over the spine.
    this.coverPivot.rotation.z = eased * 2.15;

    // Seal behaviour
    if (this.seal.visible) {
      this.sealRing.rotation.z += dt * 0.5;
      this.seal.position.y = 0.35 + Math.sin(this.time * 1.8) * 0.012;
      this.sealRing.material.emissiveIntensity = 1.0 + Math.sin(this.time * 2.6) * 0.35;
    }

    // Warm light rises out of the gutter.
    this.light.intensity = eased * 5.4 + (this.sealed ? 0 : Math.sin(this.time * 2.1) * 0.3);
    this.pageLight.intensity = eased * 2.0;
    this.hiddenPage.material.emissiveIntensity = eased * 0.65;
    if (this.particles) {
      this.particles.material.uniforms.uTime.value = this.time;
      this.particles.material.uniforms.uOpacity.value = eased * 0.85;
      this.particles.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
    }

    // Subtle idle float — this book is magical, but not cartoonish.
    this.root.position.y = Math.sin(this.time * 0.9) * 0.008;
  }

  /** Convenience for the interaction: frames the camera on the book. */
  getWorldPosition(target = new THREE.Vector3()) {
    return this.group.getWorldPosition(target);
  }
}
