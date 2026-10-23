/**
 * The traveler.
 *
 * A stylised, procedurally built avatar (documented in ASSETS.md as a
 * replaceable placeholder for a rigged GLB character) with hand-authored idle,
 * walk, run, jump and cape motion. Movement, gravity, stamina, collision and
 * camera-relative steering live here as well.
 */
import * as THREE from 'three';
import { blobShadowTexture } from './Textures.js';

const WALK_SPEED = 3.4;
const RUN_SPEED = 6.3;
const ACCEL_GROUND = 16;
const ACCEL_AIR = 6.5;
const GRAVITY = 24;
const JUMP_VELOCITY = 7.4;
const PLAYER_RADIUS = 0.4;
const MAX_STAMINA = 100;
const SPRINT_DRAIN = 17;
const STAMINA_REGEN = 24;
const JUMP_COST = 9;
const JUMP_BUFFER_TIME = 0.18;
const COYOTE_TIME = 0.12;

export class PlayerController {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'player';
    this.position = new THREE.Vector3(0, 2, 0);
    this.velocity = new THREE.Vector3();
    this.facing = Math.PI;
    this.targetFacing = Math.PI;
    this.grounded = true;
    this.stamina = MAX_STAMINA;
    this.staminaLock = 0;
    // Jump forgiveness: a tap is remembered briefly so it still fires when it
    // lands a frame or two early, and the ground is remembered briefly so
    // stepping off a ledge does not eat the jump.
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.speed = 0;
    this.isSprinting = false;
    this.isMoving = false;
    this.footstepTimer = 0;
    this.distanceWalked = 0;
    this.hasMoved = false;
    this.animTime = 0;
    this.visible = false;
    this._respawnPoint = new THREE.Vector3(0, 2, 0);
    this._respawnFacing = Math.PI;
    this._build();
    this.group.visible = false;
  }

  /* ---------------------------------------------------------------- */
  /* Model                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * A stylised, anime-inspired traveler built entirely from primitives.
   *
   * The look is deliberately "cel": flat toon bands instead of smooth shading,
   * an inverted-hull outline on the silhouette pieces, a large head with big
   * irises, layered hair with separate strands, and a layered outfit (mantle,
   * bodice, flared skirt, thigh boots, sash and a Vision-like gem).
   *
   * Every material that a look can repaint is stored on `this.materials`
   * (accent / accentDeep) or kept as its own field (capeMaterial, charmMaterial),
   * because ShopManager.applyLooks() writes into exactly those.
   */
  _build() {
    const gradient = this._toonGradient();
    const toon = (color, options = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...options });
    const flat = (color, options = {}) => new THREE.MeshBasicMaterial({ color, ...options });

    const skin = toon('#f4cfb6');
    const skinShade = toon('#dda78c');
    const cloth = toon('#f8f3e6');
    const clothShade = toon('#e4d9c4');
    const accent = toon('#2f6d78');
    const accentDeep = toon('#1d4854');
    const gold = new THREE.MeshStandardMaterial({ color: '#e3c789', roughness: 0.32, metalness: 0.9 });
    const hairMat = toon('#e6d6b2');
    const hairShade = toon('#c9b48b');
    const bootMat = toon('#4b3a2f');
    const eyeMat = flat('#5797b0');
    const eyeDark = flat('#20323c');
    const eyeWhite = flat('#fdfbf6');
    const lashMat = flat('#2a2028');
    const blushMat = flat('#dd8a82', { transparent: true, opacity: 0.32 });
    const mouthMat = flat('#a85d58');
    this.materials = {
      skin, skinShade, cloth, clothShade, accent, accentDeep, gold,
      hairMat, hairShade, bootMat, eyeMat, eyeDark, eyeWhite, lashMat, blushMat, mouthMat,
    };

    // Double-sided garment layers need their own material instance; keep them
    // listed so `applyLooks()` can repaint them along with `materials.accent`.
    this._accentClones = [];
    this._clothClones = [];
    const dyedAccent = (mesh) => {
      mesh.material = accent.clone();
      mesh.material.side = THREE.DoubleSide;
      this._accentClones.push(mesh.material);
      return mesh;
    };
    const dyedCloth = (mesh) => {
      mesh.material = cloth.clone();
      mesh.material.side = THREE.DoubleSide;
      this._clothClones.push(mesh.material);
      return mesh;
    };

    const root = new THREE.Group();
    this.group.add(root);
    this.model = root;

    /* ------------------------------ Legs ------------------------------ */

    const legL = new THREE.Group();
    const legR = new THREE.Group();
    for (const [leg, sign] of [[legL, -1], [legR, 1]]) {
      leg.position.set(sign * 0.078, 0.68, 0);

      // Stocking thigh + boot shaft, then a small foot.
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.056, 0.28, 10), accentDeep);
      thigh.position.y = -0.15;
      const thighTrim = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 5, 12), gold);
      thighTrim.rotation.x = Math.PI / 2;
      thighTrim.position.y = -0.02;

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.045, 0.3, 10), bootMat);
      shin.position.y = -0.44;
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6), bootMat);
      knee.position.y = -0.3;
      knee.scale.set(1, 0.75, 1);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.009, 5, 14), gold);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.285;

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.062, 0.17), bootMat);
      foot.position.set(0, -0.635, 0.035);
      foot.geometry.translate(0, 0, 0);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bootMat);
      toe.position.set(0, -0.638, 0.115);
      toe.scale.set(1, 0.7, 1);

      // Two buckled straps down the boot shaft and a bright sole edge.
      const straps = new THREE.Group();
      for (let i = 0; i < 2; i++) {
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.055 - i * 0.004, 0.006, 4, 12), accentDeep);
        strap.rotation.x = Math.PI / 2;
        strap.position.y = -0.345 - i * 0.075;
        const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.013, 0.008), gold);
        buckle.position.set(0, strap.position.y, 0.052);
        straps.add(strap, buckle);
      }
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.178), gold);
      sole.position.set(0, -0.663, 0.035);

      leg.add(thigh, thighTrim, shin, knee, cuff, foot, toe, straps, sole);
      this._outline(thigh, 1.09);
      this._outline(shin, 1.1);
      root.add(leg);
    }
    this.legL = legL;
    this.legR = legR;

    /* ------------------------------ Torso ------------------------------ */

    this.torso = new THREE.Group();
    this.torso.position.y = 0.62;
    root.add(this.torso);

    // Hips and bodice.
    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.132, 0.16, 14), accentDeep);
    hips.position.y = 0.1;
    const bodice = new THREE.Mesh(new THREE.CylinderGeometry(0.126, 0.112, 0.36, 16), cloth);
    bodice.position.y = 0.36;
    const chestHighlight = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 10), cloth);
    chestHighlight.position.set(0, 0.42, 0.012);
    chestHighlight.scale.set(1, 0.7, 0.8);

    // Front panel of the dress, with two gold buttons.
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.28, 0.014), accent);
    panel.position.set(0, 0.35, 0.118);
    for (const y of [0.28, 0.4]) {
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), gold);
      button.position.set(0, y, 0.128);
      this.torso.add(button);
    }

    // Flared skirt with a gold hem.
    const skirt = dyedAccent(new THREE.Mesh(new THREE.CylinderGeometry(0.124, 0.255, 0.34, 18, 1, true), accent));
    skirt.position.y = -0.03;
    const skirtHem = new THREE.Mesh(new THREE.TorusGeometry(0.252, 0.01, 5, 24), gold);
    skirtHem.rotation.x = Math.PI / 2;
    skirtHem.position.y = -0.2;

    // A lighter overskirt layer, slit at the front, for depth.
    const overskirt = dyedCloth(new THREE.Mesh(
      new THREE.CylinderGeometry(0.126, 0.172, 0.09, 18, 1, true, Math.PI * 0.38, Math.PI * 1.24),
      cloth,
    ));
    overskirt.position.y = 0.145;

    // Sash and its two hanging ends.
    // Teal corset over the cream bodice: without it the whole torso reads as
    // one white shape from the chase camera.
    const corset = dyedAccent(new THREE.Mesh(new THREE.CylinderGeometry(0.113, 0.132, 0.19, 16, 1, true), accent));
    corset.position.y = 0.275;
    const corsetTop = new THREE.Mesh(new THREE.TorusGeometry(0.114, 0.0075, 4, 18), gold);
    corsetTop.rotation.x = Math.PI / 2;
    corsetTop.position.y = 0.37;
    const corsetBottom = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.0075, 4, 20), gold);
    corsetBottom.rotation.x = Math.PI / 2;
    corsetBottom.position.y = 0.181;

    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.017, 6, 16), accentDeep);
    sash.rotation.x = Math.PI / 2;
    sash.position.y = 0.19;
    const sashKnot = new THREE.Mesh(new THREE.OctahedronGeometry(0.028, 0), gold);
    sashKnot.position.set(0.085, 0.19, 0.09);

    this.sashTails = new THREE.Group();
    this.sashTails.position.set(-0.085, 0.165, 0.055);
    for (let i = 0; i < 2; i++) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.14, 0.008), accentDeep);
      tail.position.set(i * 0.02 - 0.01, -0.07, -i * 0.012);
      tail.rotation.z = (i === 0 ? 1 : -1) * 0.14;
      this.sashTails.add(tail);
    }

    // Collar and neck ribbon.
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.018, 6, 16), clothShade);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.556;
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.024), accent);
    ribbon.position.set(0, 0.528, 0.078);
    ribbon.rotation.z = Math.PI / 4;

    // Short mantle over the shoulders.
    const mantle = dyedCloth(new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.162, 0.135, 18, 1, true), clothShade));
    mantle.position.y = 0.475;
    const mantleTrim = new THREE.Mesh(new THREE.TorusGeometry(0.174, 0.009, 5, 22), gold);
    mantleTrim.rotation.x = Math.PI / 2;
    mantleTrim.position.y = 0.402;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.13, 10), skin);
    neck.position.y = 0.6;

    /* ---- Detail pass: pauldron, clasp, lacing, belt buckle and pleats ---- */

    const trims = new THREE.Group();

    // A single shoulder pauldron with a gold rim, the asymmetric Genshin touch.
    const pauldron = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
      clothShade,
    );
    pauldron.position.set(-0.158, 0.492, 0);
    pauldron.rotation.z = 0.3;
    pauldron.scale.set(1.05, 0.7, 1.02);
    const pauldronRim = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.0075, 4, 18), gold);
    pauldronRim.position.set(-0.158, 0.47, 0);
    pauldronRim.rotation.set(Math.PI / 2, 0, 0.3);
    pauldronRim.scale.set(1.05, 1.02, 1);

    // Cape clasp: a gem set in gold at the throat.
    const throatClasp = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 4, 12), gold);
    throatClasp.position.set(0, 0.5, 0.088);
    const throatGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.017, 0), this.charmMaterial || eyeMat);
    throatGem.position.set(0, 0.5, 0.098);
    throatGem.scale.set(1, 1.25, 0.6);

    // Corset lacing across the front panel.
    for (let i = 0; i < 3; i++) {
      const lace = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.007, 0.006), gold);
      lace.position.set(0, 0.44 - i * 0.05, 0.126);
      lace.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.24;
      trims.add(lace);
    }

    // Belt buckle over the sash knot.
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.03, 0.012), gold);
    buckle.position.set(0, 0.19, 0.118);
    const buckleGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.011, 0), accentDeep);
    buckleGem.position.set(0, 0.19, 0.128);

    trims.add(pauldron, pauldronRim, throatClasp, throatGem, buckle, buckleGem);
    this._outline(pauldron, 1.08);

    this.torso.add(hips, bodice, chestHighlight, panel, skirt, skirtHem, overskirt, corset, corsetTop, corsetBottom, sash, sashKnot, this.sashTails, collar, ribbon, mantle, mantleTrim, neck, trims);
    for (const piece of [bodice, hips, skirt, mantle, skirtHem, corset]) this._outline(piece, 1.04);

    /* ------------------------------ Arms ------------------------------ */

    const armL = new THREE.Group();
    const armR = new THREE.Group();
    for (const [arm, sign] of [[armL, -1], [armR, 1]]) {
      arm.position.set(sign * 0.163, 1.115, 0);
      arm.rotation.z = sign * -0.085;

      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.066, 10, 8), cloth);
      puff.position.y = -0.005;
      puff.scale.set(1.02, 0.88, 0.98);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.042, 0.175, 9), cloth);
      upper.position.y = -0.105;

      const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.045, 0.03, 9), gold);
      bracer.position.y = -0.195;

      const forearm = new THREE.Group();
      forearm.position.y = -0.2;
      const glove = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.033, 0.17, 8), accentDeep);
      glove.position.y = -0.095;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 5, 12), gold);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.015;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.043, 8, 6), skin);
      hand.position.y = -0.205;
      hand.scale.set(0.95, 1.2, 0.75);
      forearm.add(glove, cuff, hand);

      arm.add(puff, upper, bracer, forearm);
      arm.userData.forearm = forearm;
      this._outline(puff, 1.1);
      root.add(arm);
    }
    this.armL = armL;
    this.armR = armR;
    this.forearmL = armL.userData.forearm;
    this.forearmR = armR.userData.forearm;

    /* ------------------------------ Head ------------------------------ */

    const HEAD_Y = 1.42;
    this.head = new THREE.Group();
    this.head.position.y = HEAD_Y;
    this.head.scale.setScalar(0.93);
    root.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.158, 20, 16), skin);
    skull.scale.set(1, 1.04, 0.97);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin);
    jaw.position.set(0, -0.055, 0.022);
    jaw.scale.set(0.94, 0.78, 0.95);
    this._outline(skull, 1.045);

    // Ears.
    for (const sign of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), skin);
      ear.position.set(sign * 0.152, -0.01, -0.005);
      ear.scale.set(0.5, 1, 0.75);
      this.head.add(ear);
    }

    /* -------- Face: big anime eyes, brows, blush and a small mouth ---- */

    const eyes = new THREE.Group();
    for (const sign of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sign * 0.064, -0.014, 0.14);
      eye.rotation.set(0.03, sign * 0.14, 0);

      // Sclera: a shallow dome, so the eye still catches the light.
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.046, 14, 12), eyeWhite);
      white.scale.set(1, 1.1, 0.3);

      // Flat decals just proud of the dome keep the iris crisp at any distance;
      // spheres stacked in z used to merge into one dark blob.
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0255, 18), eyeMat);
      iris.position.set(sign * 0.002, -0.002, 0.0162);
      iris.scale.set(1, 1.12, 1);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.0122, 16), eyeDark);
      pupil.position.set(sign * 0.002, -0.002, 0.0168);
      pupil.scale.set(1, 1.15, 1);
      const glint = new THREE.Mesh(new THREE.CircleGeometry(0.0062, 12), eyeWhite);
      glint.position.set(sign * -0.0085, 0.011, 0.0176);

      // Heavy upper lash with an outer flick — the strongest anime cue.
      const lash = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.0052, 4, 16, Math.PI * 0.92), lashMat);
      lash.position.set(0, 0.008, 0.0152);
      lash.scale.set(1.04, 0.9, 0.35);
      const flick = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 4), lashMat);
      flick.position.set(sign * 0.047, 0.024, 0.0135);
      flick.rotation.z = sign * -1.05;

      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.009, 0.008), hairShade);
      brow.position.set(0, 0.083, -0.006);
      brow.rotation.z = sign * -0.12;

      eye.add(white, iris, pupil, glint, lash, flick, brow);
      eyes.add(eye);
    }
    this.eyes = eyes;

    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0026, 4, 12, Math.PI), mouthMat);
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.079, 0.153);
    mouth.scale.set(1, 0.8, 1);
    const blushL = new THREE.Mesh(new THREE.CircleGeometry(0.015, 12), blushMat);
    blushL.position.set(-0.104, -0.058, 0.132);
    blushL.rotation.set(0, -0.55, 0.2);
    const blushR = blushL.clone();
    blushR.position.x = 0.104;
    blushR.rotation.set(0, 0.55, -0.2);

    // Nose, chin shading and an ear cuff: small cues that stop the face from
    // reading as a blank mannequin when the camera walks in close.
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), skinShade);
    nose.position.set(0, -0.042, 0.152);
    nose.scale.set(0.85, 0.7, 0.65);
    const earCuff = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.005, 4, 10), gold);
    earCuff.position.set(0.152, -0.03, 0.002);
    earCuff.rotation.y = Math.PI / 2;

    this.head.add(skull, jaw, eyes, mouth, blushL, blushR, nose, earCuff);

    /* ------------------------------ Hair ------------------------------ */

    // Back hair only: a full sphere would swallow the face, which is exactly
    // what used to hide the eyes behind the fringe.
    const hairBack = new THREE.Mesh(
      new THREE.SphereGeometry(0.172, 20, 14, Math.PI * 1.02, Math.PI * 0.96),
      hairMat,
    );
    hairBack.scale.set(1.02, 1.04, 1.04);
    hairBack.position.set(0, 0.012, -0.018);

    // The fringe cap sits on the crown; separate strands do the shaping.
    // The cap stops at the hairline. Anything longer sweeps over the brow and
    // buries the eyes, which is what made the face invisible up close. It is
    // also cut open at the front (phiStart/phiLength) so it never covers the
    // face even when the head tilts.
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.175, 22, 12, Math.PI * 0.24, Math.PI * 1.52, 0, Math.PI * 0.46),
      hairMat,
    );
    cap.position.set(0, 0.014, 0);
    cap.rotation.x = -0.06;

    const hairPieces = [hairBack, cap];
    // Fringe strands: short, tucked under the cap and pointed *at* the brows,
    // so they read as hair rather than as horns.
    const fringeSpecs = [
      [-0.105, 0.066, 0.093, 0.105, 0.16],
      [-0.06, 0.08, 0.115, 0.115, 0.07],
      [-0.012, 0.084, 0.126, 0.125, 0.0],
      [0.04, 0.08, 0.116, 0.115, -0.07],
      [0.09, 0.068, 0.096, 0.105, -0.16],
    ];
    fringeSpecs.forEach(([x, y, z, len, tilt], index) => {
      const strand = new THREE.Mesh(
        new THREE.ConeGeometry(0.024, len, 5),
        index % 2 === 0 ? hairMat : hairShade,
      );
      strand.position.set(x, y, z);
      strand.rotation.set(Math.PI - 0.03, 0, tilt);
      strand.scale.set(1.1, 1, 0.5);
      hairPieces.push(strand);
    });

    // Long side locks framing the face.
    for (const sign of [-1, 1]) {
      const lock = new THREE.Mesh(new THREE.ConeGeometry(0.043, 0.32, 7), hairMat);
      lock.position.set(sign * 0.163, -0.075, -0.03);
      lock.rotation.set(Math.PI - 0.08, 0, sign * 0.09);
      lock.scale.set(1, 1, 0.62);
      hairPieces.push(lock);
      const lockTip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 6), hairShade);
      lockTip.position.set(sign * 0.175, -0.245, -0.02);
      lockTip.rotation.set(Math.PI - 0.06, 0, sign * 0.1);
      lockTip.scale.set(1, 1, 0.66);
      hairPieces.push(lockTip);
    }

    // Ahoge — the little antenna strand every traveler has.
    const ahoge = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.13, 5), hairMat);
    ahoge.position.set(0.018, 0.2, 0.02);
    ahoge.rotation.set(0.5, 0, -0.5);
    hairPieces.push(ahoge);

    // High ponytail: three tapering segments so it can flutter.
    const ponytail = new THREE.Group();
    ponytail.position.set(0, 0.075, -0.155);
    let segmentParent = ponytail;
    const segmentLengths = [0.2, 0.18, 0.16];
    const segmentWidths = [0.062, 0.052, 0.036];
    for (let i = 0; i < segmentLengths.length; i++) {
      const segment = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(segmentWidths[i] * 0.72, segmentWidths[i], segmentLengths[i], 7),
        i === 0 ? hairMat : hairShade,
      );
      mesh.position.y = -segmentLengths[i] / 2;
      mesh.rotation.x = i === 0 ? 0.12 : 0;
      segment.add(mesh);
      if (i > 0) segment.position.y = -segmentLengths[i - 1];
      segmentParent.add(segment);
      segmentParent = segment;
      hairPieces.push(mesh);
    }
    ponytail.rotation.x = 0.42;
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.013, 5, 12), gold);
    tie.rotation.x = Math.PI / 2;
    ponytail.add(tie);
    this.ponytail = ponytail;
    hairPieces.push(tie);

    // Pale highlight strands across the crown.
    const hairLight = toon('#f6ecd2');
    for (const [x, y, z, tilt, len] of [
      [-0.085, 0.095, 0.105, -0.3, 0.1],
      [-0.015, 0.135, 0.105, 0.04, 0.13],
      [0.07, 0.105, 0.1, 0.26, 0.095],
    ]) {
      const shine = new THREE.Mesh(new THREE.ConeGeometry(0.017, len, 4), hairLight);
      shine.position.set(x, y, z);
      shine.rotation.set(Math.PI - 0.2, 0, tilt);
      shine.scale.set(1.1, 1, 0.42);
      hairPieces.push(shine);
    }

    // A small gold crescent clip over the left temple.
    const clip = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0045, 4, 14, Math.PI * 1.2), gold);
    clip.position.set(-0.108, 0.096, 0.108);
    clip.rotation.set(0.42, -0.6, 1.25);
    const clipPin = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), accentDeep);
    clipPin.position.set(-0.09, 0.083, 0.132);
    hairPieces.push(clip, clipPin);

    // Ribbon bow at the base of the ponytail.
    const bowKnot = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), accent);
    bowKnot.position.set(0, 0.008, -0.185);
    const bowWing = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.07, 4), accent);
    bowWing.position.set(-0.042, 0.014, -0.19);
    bowWing.rotation.set(0.2, 0, Math.PI * 0.62);
    bowWing.scale.set(1, 1, 0.5);
    const bowWingR = bowWing.clone();
    bowWingR.position.x = 0.042;
    bowWingR.rotation.z = -Math.PI * 0.62;
    hairPieces.push(bowKnot, bowWing, bowWingR);

    this.head.add(...hairPieces);
    for (const piece of [hairBack, cap]) this._outline(piece, 1.03);

    /* ------------------------------ Cape ------------------------------ */

    const capeGeo = new THREE.PlaneGeometry(0.44, 0.86, 8, 12);
    {
      const pos = capeGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = (y + 0.43) / 0.86; // 0 at the hem, 1 at the collar
        const width = 0.78 + (1 - t) * 0.62;
        pos.setX(i, pos.getX(i) * width);
        const x = pos.getX(i);
        // Cup it around the back (sides curve toward the body) and let the hem
        // flare outward instead of clipping through the skirt.
        pos.setZ(i, -Math.sin(t * Math.PI) * 0.06 + Math.abs(x) * 0.5 + (1 - t) * 0.1);
        pos.setY(i, y + (1 - t) * (1 - t) * 0.06);
      }
      capeGeo.computeVertexNormals();
    }
    this.capeMaterial = toon('#295f6b', { side: THREE.DoubleSide });
    const capeMesh = new THREE.Mesh(capeGeo, this.capeMaterial);
    capeMesh.position.y = -0.43;

    // Pivot the cape at the shoulders, so _animate() swings it like cloth.
    this.cape = new THREE.Group();
    this.cape.position.set(0, 1.14, -0.155);
    this.cape.rotation.x = 0.18;
    this.cape.add(capeMesh);
    root.add(this.cape);

    // Gold clasp at the throat.
    const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), gold);
    clasp.position.set(0, 1.155, 0.075);
    clasp.scale.set(1, 0.85, 0.55);
    root.add(clasp);

    // Scarf ribbon ends that stream behind the shoulders.
    this.scarfTails = new THREE.Group();
    this.scarfTails.position.set(0.05, 1.18, -0.06);
    for (const [index, sign] of [[0, 1], [1, -1]]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.24, 0.012), clothShade);
      tail.position.set(sign * 0.04, -0.12, -0.02 - index * 0.02);
      tail.rotation.z = sign * 0.12;
      this.scarfTails.add(tail);
    }
    root.add(this.scarfTails);

    /* --------------------------- The Vision --------------------------- */

    this.pendant = new THREE.Group();
    this.pendant.position.set(-0.125, 0.775, 0.062);
    this.pendant.rotation.z = 0.18;
    this.charmMaterial = new THREE.MeshStandardMaterial({
      color: '#bff0e4',
      emissive: '#6fd8c6',
      emissiveIntensity: 1.3,
      roughness: 0.2,
      metalness: 0.1,
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.038, 0), this.charmMaterial);
    const charmFrame = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 4, 14), gold);
    charmFrame.rotation.x = Math.PI / 2;
    const charmWingL = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.062, 4), gold);
    charmWingL.position.set(-0.054, 0.012, 0);
    charmWingL.rotation.z = Math.PI / 2.6;
    const charmWingR = charmWingL.clone();
    charmWingR.position.x = 0.054;
    charmWingR.rotation.z = -Math.PI / 2.6;
    this.pendant.add(crystal, charmFrame, charmWingL, charmWingR);
    this.pendantCrystal = crystal;
    root.add(this.pendant);

    /* --------------------------- Companion wisp ------------------------ */

    this.companionMaterial = new THREE.MeshStandardMaterial({
      color: '#d9e6ff',
      emissive: '#8fb4ff',
      emissiveIntensity: 1.6,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.94,
    });
    this.companion = new THREE.Group();
    this.companion.position.set(-0.52, 1.36, -0.16);
    const wispCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.058, 0), this.companionMaterial);
    const wispHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.105, 0.007, 5, 20),
      new THREE.MeshBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0.6 }),
    );
    wispHalo.rotation.x = Math.PI / 2.6;
    const wispHalo2 = wispHalo.clone();
    wispHalo2.rotation.set(Math.PI / 2, 0.6, 0.4);
    wispHalo2.scale.setScalar(0.78);
    this.companion.add(wispCore, wispHalo, wispHalo2);
    this.companionCore = wispCore;
    this.companionHalos = [wispHalo, wispHalo2];
    this.companion.visible = false;
    root.add(this.companion);

    /* ------------------------------ Shadow ---------------------------- */

    const shadowMat = new THREE.MeshBasicMaterial({
      map: blobShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), shadowMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.02;
    this.blob.renderOrder = 1;
    this.group.add(this.blob);

    root.traverse((obj) => {
      if (obj.isMesh && obj !== this.blob) {
        obj.castShadow = false; // enabled per light quality in setShadows()
        obj.receiveShadow = false;
      }
    });

    this.group.scale.setScalar(1);
  }

  /** A 4-step ramp, so toon materials band instead of shading smoothly. */
  _toonGradient() {
    if (this._gradientMap) return this._gradientMap;
    const steps = new Uint8Array([70, 140, 205, 255]);
    const texture = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this._gradientMap = texture;
    return texture;
  }

  /** Inverted-hull outline: the anime silhouette line. */
  _outline(mesh, thickness = 1.05) {
    const outline = new THREE.Mesh(
      mesh.geometry,
      this._outlineMaterial || (this._outlineMaterial = new THREE.MeshBasicMaterial({
        color: '#0c1119',
        side: THREE.BackSide,
      })),
    );
    outline.scale.setScalar(thickness);
    outline.userData.isOutline = true;
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.renderOrder = -1;
    mesh.add(outline);
    return outline;
  }

  setShadows(enabled) {
    this.model.traverse((obj) => {
      if (obj.isMesh && !obj.userData.isOutline) obj.castShadow = enabled;
    });
  }

  /**
   * Wear the looks bought or wished for at the Wanderer's Ledger.
   * Everything is optional: `{}` restores the traveler's own clothes.
   */
  applyLooks(looks = {}) {
    const accent = looks.dye || { color: '#2f6d78', deep: '#1d4854' };
    this.materials.accent.color.set(accent.color);
    this.materials.accentDeep.color.set(accent.deep);
    for (const material of this._accentClones || []) material.color.set(accent.color);
    const clothTint = looks.cape ? new THREE.Color(looks.cape.color).lerp(new THREE.Color('#f8f3e6'), 0.82) : null;
    for (const material of this._clothClones || []) material.color.copy(clothTint || this.materials.clothShade.color);

    const cape = looks.cape || { color: '#295f6b', deep: '#1a3f48' };
    this.capeMaterial.color.set(cape.color);

    const charm = looks.charm || { color: '#bff0e4', emissive: '#6fd8c6' };
    this.charmMaterial.color.set(charm.color);
    this.charmMaterial.emissive.set(charm.emissive);

    const companion = looks.companion || null;
    this.companion.visible = !!companion;
    if (companion) {
      this.companionMaterial.color.set(companion.color);
      this.companionMaterial.emissive.set(companion.emissive);
      this.companion.scale.setScalar(companion.scale || 1);
    }

    this.wornLooks = {
      title: looks.title || null,
      cape: looks.cape ? cape.color : null,
      charm: looks.charm ? charm.color : null,
      companion: companion ? companion.color : null,
    };
    return this.wornLooks;
  }

  /* ---------------------------------------------------------------- */
  /* Placement                                                        */
  /* ---------------------------------------------------------------- */

  teleport(x, z, yaw = this.facing) {
    const ground = this.game.worlds?.getHeightAt(x, z) ?? 0;
    this.position.set(x, ground + 0.05, z);
    this.velocity.set(0, 0, 0);
    this.group.position.copy(this.position);
    this.facing = yaw;
    this.targetFacing = yaw;
    this.group.rotation.y = yaw;
    this.grounded = true;
    this._respawnPoint.set(x, ground, z);
    this._respawnFacing = yaw;
    this.game.cameraController.snapToPlayer();
  }

  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
  }

  respawn() {
    const { x, z } = this._respawnPoint;
    this.teleport(x, z, this._respawnFacing);
    this.game.bus.emit('player:respawned');
  }

  /* ---------------------------------------------------------------- */
  /* Update                                                           */
  /* ---------------------------------------------------------------- */

  update(dt, elapsed) {
    if (!this.visible) return;
    this.animTime += dt;
    const blocked = this.game.isMovementBlocked();
    const input = this.game.input;
    const move = blocked ? { x: 0, y: 0 } : input.getMoveVector();

    const cam = this.game.cameraController;
    const forward = cam.getForward();
    const right = cam.getRight();

    let dirX = forward.x * move.y + right.x * move.x;
    let dirZ = forward.z * move.y + right.z * move.x;
    const inputLength = Math.hypot(dirX, dirZ);
    if (inputLength > 0.001) {
      dirX /= inputLength;
      dirZ /= inputLength;
    }

    const wantsSprint = !blocked && input.isDown('sprint') && inputLength > 0.1;
    this.isSprinting = wantsSprint && this.stamina > 1;
    if (this.isSprinting) {
      this.stamina = Math.max(0, this.stamina - SPRINT_DRAIN * dt);
      this.staminaLock = 0.9;
    } else {
      this.staminaLock = Math.max(0, this.staminaLock - dt);
      if (this.staminaLock <= 0) this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN * dt);
    }

    const targetSpeed = inputLength > 0.05 ? (this.isSprinting ? RUN_SPEED : WALK_SPEED) : 0;
    const accel = this.grounded ? ACCEL_GROUND : ACCEL_AIR;
    const targetVX = dirX * targetSpeed;
    const targetVZ = dirZ * targetSpeed;
    const blend = 1 - Math.exp(-accel * dt);
    this.velocity.x += (targetVX - this.velocity.x) * blend;
    this.velocity.z += (targetVZ - this.velocity.z) * blend;

    // Jump — buffered and forgiving, and never silently refused for stamina.
    if (input.consumePress('jump')) this.jumpBuffer = JUMP_BUFFER_TIME;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? COYOTE_TIME : Math.max(0, this.coyote - dt);

    if (!blocked && this.jumpBuffer > 0 && this.coyote > 0 && this.stamina > 1) {
      this.velocity.y = JUMP_VELOCITY;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.stamina = Math.max(0, this.stamina - JUMP_COST);
      this.staminaLock = 0.7;
      this.game.audio?.play('jump');
      this.game.worlds?.spawnFootstepDust?.(this.position, 1.6);
    }

    // Gravity
    this.velocity.y -= GRAVITY * dt;
    if (this.velocity.y < -40) this.velocity.y = -40;

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Horizontal collision
    const before = { x: this.position.x, z: this.position.z };
    if (this.game.collision.resolve(this.position, PLAYER_RADIUS)) {
      // If we were pushed, kill the velocity component into the obstacle.
      const pushX = this.position.x - before.x;
      const pushZ = this.position.z - before.z;
      const pushLen = Math.hypot(pushX, pushZ);
      if (pushLen > 0.0001) {
        const nx = pushX / pushLen;
        const nz = pushZ / pushLen;
        const into = this.velocity.x * nx + this.velocity.z * nz;
        if (into < 0) {
          this.velocity.x -= nx * into;
          this.velocity.z -= nz * into;
        }
      }
    }

    // Terrain
    const ground = this.game.worlds?.getHeightAt(this.position.x, this.position.z) ?? 0;
    if (this.position.y <= ground + 0.02) {
      if (!this.grounded && this.velocity.y < -6) {
        this.game.audio?.play('land');
      }
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // Fell out of the world — recover instead of failing.
    if (this.position.y < -18) {
      this.respawn();
      this.game.toast?.('The wind lifts you back to the path.', 'hint');
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.isMoving = this.speed > 0.35;

    if (this.isMoving) {
      this.targetFacing = Math.atan2(this.velocity.x, this.velocity.z);
      this.distanceWalked += this.speed * dt;
      if (!this.hasMoved && this.distanceWalked > 1.4) {
        this.hasMoved = true;
        this.game.bus.emit('player:first-steps');
      }
    }

    // Smooth facing (shortest arc)
    let delta = this.targetFacing - this.facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.facing += delta * Math.min(1, dt * 12);
    this.group.rotation.y = this.facing;

    this.group.position.set(this.position.x, this.position.y, this.position.z);

    this._animate(dt, elapsed);

    // Footsteps
    if (this.grounded && this.speed > 0.9) {
      this.footstepTimer -= dt * (this.speed / WALK_SPEED);
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.46;
        this.game.audio?.play('footstep', { surface: this.game.worlds?.getSurface?.() || 'grass' });
        this.game.worlds?.spawnFootstepDust?.(this.position);
      }
    } else {
      this.footstepTimer = Math.min(this.footstepTimer, 0.2);
    }

    this.syncShadow();
  }

  _animate(dt, elapsed) {
    const t = this.animTime;
    const speedRatio = THREE.MathUtils.clamp(this.speed / RUN_SPEED, 0, 1);
    const walkCycle = t * (4.2 + speedRatio * 5.4);
    const swing = Math.sin(walkCycle) * (0.18 + speedRatio * 0.62);
    const stride = this.isMoving ? speedRatio : 0;
    const ease = Math.min(1, dt * 7);

    if (this.grounded) {
      this.legL.rotation.x = this.isMoving ? swing : 0;
      this.legR.rotation.x = this.isMoving ? -swing : 0;
      this.armL.rotation.x = this.isMoving ? -swing * 0.85 : Math.sin(t * 1.6) * 0.03;
      this.armR.rotation.x = this.isMoving ? swing * 0.85 : -Math.sin(t * 1.6) * 0.03;
      this.armL.rotation.z = 0.06;
      this.armR.rotation.z = -0.06;

      // Elbows bend more the faster the traveler runs, and lift a little at the
      // front of the swing so the arms read as pumping rather than pendulums.
      const pump = Math.max(0, Math.sin(walkCycle));
      const elbow = -0.12 - stride * (0.42 + pump * 0.3);
      this.forearmL.rotation.x = THREE.MathUtils.lerp(this.forearmL.rotation.x, elbow, ease);
      this.forearmR.rotation.x = THREE.MathUtils.lerp(this.forearmR.rotation.x, elbow, ease);
      this.forearmL.rotation.z = 0.05;
      this.forearmR.rotation.z = -0.05;
    } else {
      this.legL.rotation.x = 0.42;
      this.legR.rotation.x = -0.28;
      this.armL.rotation.x = -0.5;
      this.armR.rotation.x = -0.5;
      this.armL.rotation.z = 0.28;
      this.armR.rotation.z = -0.28;
      this.forearmL.rotation.x = THREE.MathUtils.lerp(this.forearmL.rotation.x, -0.55, ease);
      this.forearmR.rotation.x = THREE.MathUtils.lerp(this.forearmR.rotation.x, -0.55, ease);
    }

    // Body bob & lean. Idle keeps a slow breath and a small weight shift.
    const breathing = Math.sin(t * 1.35) * 0.006;
    const bob = this.isMoving
      ? Math.abs(Math.sin(walkCycle)) * 0.035 * (0.4 + speedRatio)
      : breathing;
    this.model.position.y = bob;
    const lean = this.isMoving ? 0.05 + speedRatio * 0.1 : 0;
    this.model.rotation.x = THREE.MathUtils.lerp(this.model.rotation.x, lean, Math.min(1, dt * 6));
    this.torso.rotation.y = this.isMoving ? Math.sin(walkCycle) * 0.055 : Math.sin(t * 1.2) * 0.02;
    this.torso.rotation.z = this.isMoving ? Math.sin(walkCycle) * 0.02 : Math.sin(t * 0.7) * 0.012;
    this.torso.scale.set(1, 1 + (this.isMoving ? 0 : breathing * 0.6), 1);

    // Head: looks where the body is going, and idly glances when standing still.
    const idleGlance = Math.sin(t * 0.42) * Math.sin(t * 0.17) * 0.22;
    const headYaw = this.isMoving ? -Math.sin(walkCycle * 0.5) * 0.04 : idleGlance;
    this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, headYaw, Math.min(1, dt * 3));
    this.head.rotation.x = this.isMoving ? -lean * 0.35 : Math.sin(t * 0.5) * 0.02;
    this.head.position.y = 1.42 + (this.isMoving ? Math.abs(Math.sin(walkCycle * 2)) * 0.008 : breathing * 0.4);

    // Cape and hair follow speed + wind
    const windFlutter = Math.sin(t * 2.4) * 0.045 + Math.sin(t * 5.1) * 0.015;
    const capeTarget = 0.16 + speedRatio * 0.55 + windFlutter + (this.grounded ? 0 : 0.35);
    this.cape.rotation.x += (capeTarget - this.cape.rotation.x) * Math.min(1, dt * 5);
    this.cape.rotation.z = Math.sin(t * 1.9) * 0.035 * (0.4 + speedRatio);
    this.ponytail.rotation.x = 0.42 + Math.sin(t * 2.1) * 0.09 + speedRatio * 0.22 + windFlutter;
    this.ponytail.rotation.z = Math.sin(t * 1.4) * 0.06;

    // Scarf tails stream back at speed and settle when standing.
    this.scarfTails.rotation.x = -0.12 - speedRatio * 0.55 + Math.sin(t * 3.2) * 0.05;
    this.scarfTails.rotation.z = Math.sin(t * 1.6) * 0.06;
    this.scarfTails.children.forEach((tail, index) => {
      tail.rotation.x = Math.sin(t * (2.8 + index * 0.6)) * (0.08 + speedRatio * 0.16);
    });

    // Blink: a short, uneven cycle so the face never looks frozen.
    const blinkPhase = t % 4.6;
    const blink = blinkPhase > 4.36 ? Math.max(0.08, Math.abs(Math.cos((blinkPhase - 4.36) * 26))) : 1;
    if (this.eyes) this.eyes.scale.y = blink;

    // Vision glimmer
    this.pendantCrystal.rotation.y += dt * 1.4;
    this.pendantCrystal.position.y = Math.sin(t * 1.8) * 0.012;
    this.pendant.position.y = 0.775 + Math.sin(t * 1.5) * 0.008;

    // Companion wisp: hovers at the shoulder, orbiting slowly.
    if (this.companion.visible) {
      const orbit = Math.sin(t * 0.6) * 0.14;
      this.companion.position.x = -0.52 - orbit * 0.4;
      this.companion.position.y = 1.36 + Math.sin(t * 1.6) * 0.05 + speedRatio * 0.06;
      this.companion.position.z = -0.18 - Math.sin(t * 0.9) * 0.06;
      this.companionCore.rotation.y += dt * 1.8;
      this.companionCore.rotation.x += dt * 0.9;
      this.companionMaterial.emissiveIntensity = 1.3 + Math.sin(t * 2.6) * 0.35;
      this.companionHalos[0].rotation.z += dt * 0.8;
      this.companionHalos[1].rotation.y -= dt * 0.55;
    }
  }

  syncShadow() {
    const ground = this.game.worlds?.getHeightAt(this.position.x, this.position.z) ?? 0;
    this.blob.position.y = ground - this.position.y + 0.03;
    const height = Math.max(0, this.position.y - ground);
    const scale = 1 - Math.min(0.45, height * 0.06);
    this.blob.scale.setScalar(scale);
    this.blob.material.opacity = 0.5 * (1 - Math.min(0.65, height * 0.1));
  }

  get staminaRatio() {
    return this.stamina / MAX_STAMINA;
  }
}
