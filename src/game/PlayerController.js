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

  _build() {
    const skin = new THREE.MeshStandardMaterial({ color: '#f0cdb2', roughness: 0.85, metalness: 0 });
    const cloth = new THREE.MeshStandardMaterial({ color: '#f3e9d2', roughness: 0.9, metalness: 0 });
    const clothShade = new THREE.MeshStandardMaterial({ color: '#d9c8a6', roughness: 0.9, metalness: 0 });
    const accent = new THREE.MeshStandardMaterial({ color: '#2f6d78', roughness: 0.7, metalness: 0.08 });
    const accentDeep = new THREE.MeshStandardMaterial({ color: '#1d4854', roughness: 0.7, metalness: 0.1 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d9b877', roughness: 0.34, metalness: 0.85 });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#e7ddc9', roughness: 0.72, metalness: 0.02 });
    const bootMat = new THREE.MeshStandardMaterial({ color: '#5b4430', roughness: 0.9, metalness: 0 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#2a4652', roughness: 0.4, metalness: 0.1 });
    this.materials = { skin, cloth, clothShade, accent, accentDeep, gold, hairMat, bootMat, eyeMat };

    const root = new THREE.Group();
    root.position.y = 0;
    this.group.add(root);
    this.model = root;

    // ---- Legs
    const legGeo = new THREE.CylinderGeometry(0.082, 0.068, 0.44, 7);
    const bootGeo = new THREE.BoxGeometry(0.16, 0.16, 0.25);
    const legL = new THREE.Group();
    const legR = new THREE.Group();
    for (const [leg, sign] of [
      [legL, -1],
      [legR, 1],
    ]) {
      leg.position.set(sign * 0.11, 0.62, 0);
      const thigh = new THREE.Mesh(legGeo, clothShade);
      thigh.position.y = -0.18;
      const boot = new THREE.Mesh(bootGeo, bootMat);
      boot.position.set(0, -0.42, 0.03);
      const bootTrim = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.26), gold);
      bootTrim.position.set(0, -0.34, 0.03);
      leg.add(thigh, boot, bootTrim);
      root.add(leg);
    }
    this.legL = legL;
    this.legR = legR;

    // ---- Torso
    this.torso = new THREE.Group();
    this.torso.position.y = 0.64;
    root.add(this.torso);

    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.17, 0.42, 10), cloth);
    chest.position.y = 0.21;
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.2, 10), accent);
    waist.position.y = -0.02;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.022, 6, 14), gold);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.06;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.09, 10), accentDeep);
    collar.position.y = 0.42;

    // Short tunic skirt
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.26, 10, 1, true), accent);
    skirt.position.y = -0.1;
    skirt.material.side = THREE.DoubleSide;

    // Chest emblem
    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), gold);
    emblem.position.set(0, 0.28, 0.19);
    emblem.rotation.z = Math.PI / 4;

    this.torso.add(chest, waist, belt, collar, skirt, emblem);

    // ---- Arms (shoulder → elbow → wrist, so a run can bend at the elbow)
    const upperGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.2, 7);
    const foreGeo = new THREE.CylinderGeometry(0.048, 0.042, 0.19, 7);
    const handGeo = new THREE.SphereGeometry(0.052, 8, 6);
    const armL = new THREE.Group();
    const armR = new THREE.Group();
    for (const [arm, sign] of [
      [armL, -1],
      [armR, 1],
    ]) {
      arm.position.set(sign * 0.235, 1.28, 0);
      // Soft shoulder cap so the silhouette does not read as a tube.
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.062, 9, 7), cloth);
      shoulder.position.y = -0.02;
      const upper = new THREE.Mesh(upperGeo, cloth);
      upper.position.y = -0.12;
      const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.05, 8), gold);
      bracer.position.y = -0.21;

      const forearm = new THREE.Group();
      forearm.position.y = -0.22;
      const fore = new THREE.Mesh(foreGeo, skin);
      fore.position.y = -0.09;
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.07, 8), accentDeep);
      cuff.position.y = -0.05;
      const hand = new THREE.Mesh(handGeo, skin);
      hand.position.y = -0.2;
      hand.scale.set(0.9, 1.15, 0.7);
      forearm.add(fore, cuff, hand);

      arm.add(shoulder, upper, bracer, forearm);
      arm.userData.forearm = forearm;
      arm.userData.shoulderY = arm.position.y;
      root.add(arm);
    }
    this.armL = armL;
    this.armR = armR;
    this.forearmL = armL.userData.forearm;
    this.forearmR = armR.userData.forearm;

    // ---- Scarf: a short wrap with two animated tails
    const scarfMat = new THREE.MeshStandardMaterial({ color: '#c8d8d2', roughness: 0.92, metalness: 0 });
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.042, 7, 14), scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.4;
    scarf.scale.set(1.15, 1, 0.9);
    root.add(scarf);

    this.scarfTails = new THREE.Group();
    this.scarfTails.position.set(0.06, 1.37, -0.09);
    for (const [index, sign] of [[0, 1], [1, -1]]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.3, 0.02), scarfMat);
      tail.position.set(sign * 0.055, -0.15, -0.02 - index * 0.02);
      tail.rotation.z = sign * 0.16;
      this.scarfTails.add(tail);
    }
    root.add(this.scarfTails);

    // ---- Head
    this.head = new THREE.Group();
    this.head.position.y = 1.46;
    root.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), skin);
    skull.scale.set(1, 1.06, 0.96);

    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.215, 16, 12), hairMat);
    hairBack.scale.set(1.03, 1.05, 1.02);
    hairBack.position.y = 0.03;
    hairBack.rotation.x = -0.12;

    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.205, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), hairMat);
    fringe.position.set(0, 0.05, 0.01);
    fringe.rotation.x = -0.22;

    const ponytail = new THREE.Group();
    ponytail.position.set(0, 0.12, -0.16);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.5, 7), hairMat);
    tail.position.set(0, -0.2, -0.12);
    tail.rotation.x = 0.55;
    ponytail.add(tail);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 5, 10), gold);
    tie.rotation.x = Math.PI / 2;
    ponytail.add(tie);

    const eyeGeo = new THREE.SphereGeometry(0.026, 8, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.075, 0.0, 0.178);
    eyeR.position.set(0.075, 0.0, 0.178);
    eyeL.scale.set(1, 1.25, 0.5);
    eyeR.scale.set(1, 1.25, 0.5);

    this.head.add(skull, hairBack, fringe, ponytail, eyeL, eyeR);
    this.ponytail = ponytail;

    // ---- Cape
    const capeGeo = new THREE.PlaneGeometry(0.46, 0.94, 8, 10);
    {
      const pos = capeGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = (y + 0.47) / 0.94; // 0 at the hem, 1 at the shoulders
        // Narrow at the shoulders, flared at the hem, and curled around the back.
        const width = 0.62 + (1 - t) * 0.42;
        pos.setX(i, pos.getX(i) * width);
        const x = pos.getX(i);
        pos.setZ(i, Math.sin(t * Math.PI) * 0.1 + Math.abs(x) * 0.5 + (1 - t) * 0.04);
        pos.setY(i, y - (1 - t) * (1 - t) * 0.04);
      }
      capeGeo.computeVertexNormals();
    }
    this.capeMaterial = new THREE.MeshStandardMaterial({
      color: '#295f6b',
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.cape = new THREE.Mesh(capeGeo, this.capeMaterial);
    this.cape.position.set(0, 1.12, -0.12);
    this.cape.rotation.x = 0.18;
    root.add(this.cape);

    const capePin = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), gold);
    capePin.position.set(0, 1.36, 0.12);
    root.add(capePin);

    // ---- Wind sigil pendant (subtle magical identity)
    this.pendant = new THREE.Group();
    this.pendant.position.set(0.17, 1.2, 0.15);
    this.charmMaterial = new THREE.MeshStandardMaterial({
      color: '#bff0e4',
      emissive: '#6fd8c6',
      emissiveIntensity: 1.3,
      roughness: 0.2,
      metalness: 0.1,
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.048, 0), this.charmMaterial);
    this.pendant.add(crystal);
    this.pendantCrystal = crystal;
    root.add(this.pendant);

    // ---- Companion wisp: only visible when a companion look is worn
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
    this.companion.position.set(-0.55, 1.42, -0.18);
    const wispCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.062, 0), this.companionMaterial);
    const wispHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.008, 5, 20),
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

    // Blob shadow (cheap, always readable).
    const shadowMat = new THREE.MeshBasicMaterial({
      map: blobShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), shadowMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.02;
    this.blob.renderOrder = 1;
    this.group.add(this.blob);

    root.traverse((obj) => {
      if (obj.isMesh && obj !== this.blob) {
        obj.castShadow = false; // enabled per light quality below
        obj.receiveShadow = false;
      }
    });

    this.group.scale.setScalar(1);
  }

  setShadows(enabled) {
    this.model.traverse((obj) => {
      if (obj.isMesh) obj.castShadow = enabled;
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

    // Jump
    if (!blocked && input.consumePress('jump') && this.grounded && this.stamina > JUMP_COST) {
      this.velocity.y = JUMP_VELOCITY;
      this.grounded = false;
      this.stamina = Math.max(0, this.stamina - JUMP_COST);
      this.staminaLock = 0.7;
      this.game.audio?.play('jump');
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
    this.head.position.y = 1.46 + (this.isMoving ? Math.abs(Math.sin(walkCycle * 2)) * 0.008 : breathing * 0.4);

    // Cape and hair follow speed + wind
    const windFlutter = Math.sin(t * 2.4) * 0.045 + Math.sin(t * 5.1) * 0.015;
    const capeTarget = 0.16 + speedRatio * 0.55 + windFlutter + (this.grounded ? 0 : 0.35);
    this.cape.rotation.x += (capeTarget - this.cape.rotation.x) * Math.min(1, dt * 5);
    this.cape.rotation.z = Math.sin(t * 1.9) * 0.035 * (0.4 + speedRatio);
    this.ponytail.rotation.x = Math.sin(t * 2.1) * 0.09 + speedRatio * 0.22 + windFlutter;
    this.ponytail.rotation.z = Math.sin(t * 1.4) * 0.06;

    // Scarf tails stream back at speed and settle when standing.
    this.scarfTails.rotation.x = -0.12 - speedRatio * 0.55 + Math.sin(t * 3.2) * 0.05;
    this.scarfTails.rotation.z = Math.sin(t * 1.6) * 0.06;
    this.scarfTails.children.forEach((tail, index) => {
      tail.rotation.x = Math.sin(t * (2.8 + index * 0.6)) * (0.08 + speedRatio * 0.16);
    });

    // Pendant glimmer
    this.pendantCrystal.rotation.y += dt * 1.4;
    this.pendantCrystal.position.y = Math.sin(t * 1.8) * 0.012;
    this.pendant.position.y = 1.2 + Math.sin(t * 1.5) * 0.008;

    // Companion wisp: hovers at the shoulder, orbiting slowly.
    if (this.companion.visible) {
      const orbit = Math.sin(t * 0.6) * 0.14;
      this.companion.position.x = -0.55 - orbit * 0.4;
      this.companion.position.y = 1.42 + Math.sin(t * 1.6) * 0.05 + speedRatio * 0.06;
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
