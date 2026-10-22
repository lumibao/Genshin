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

    // ---- Arms
    const armGeo = new THREE.CylinderGeometry(0.055, 0.048, 0.38, 7);
    const handGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const armL = new THREE.Group();
    const armR = new THREE.Group();
    for (const [arm, sign] of [
      [armL, -1],
      [armR, 1],
    ]) {
      arm.position.set(sign * 0.235, 1.28, 0);
      const upper = new THREE.Mesh(armGeo, cloth);
      upper.position.y = -0.17;
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.06, 8), accentDeep);
      cuff.position.y = -0.32;
      const hand = new THREE.Mesh(handGeo, skin);
      hand.position.y = -0.4;
      arm.add(upper, cuff, hand);
      root.add(arm);
    }
    this.armL = armL;
    this.armR = armR;

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
    const capeGeo = new THREE.PlaneGeometry(0.46, 0.92, 6, 8);
    {
      const pos = capeGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const x = pos.getX(i);
        const t = (y + 0.46) / 0.92;
        pos.setZ(i, Math.sin(t * Math.PI) * 0.12 + Math.abs(x) * 0.14);
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
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.045, 0),
      new THREE.MeshStandardMaterial({
        color: '#bff0e4',
        emissive: '#6fd8c6',
        emissiveIntensity: 1.3,
        roughness: 0.2,
        metalness: 0.1,
      }),
    );
    this.pendant.add(crystal);
    this.pendantCrystal = crystal;
    root.add(this.pendant);

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

    if (this.grounded) {
      this.legL.rotation.x = this.isMoving ? swing : 0;
      this.legR.rotation.x = this.isMoving ? -swing : 0;
      this.armL.rotation.x = this.isMoving ? -swing * 0.85 : Math.sin(t * 1.6) * 0.03;
      this.armR.rotation.x = this.isMoving ? swing * 0.85 : -Math.sin(t * 1.6) * 0.03;
      this.armL.rotation.z = 0.06;
      this.armR.rotation.z = -0.06;
    } else {
      this.legL.rotation.x = 0.42;
      this.legR.rotation.x = -0.28;
      this.armL.rotation.x = -0.5;
      this.armR.rotation.x = -0.5;
      this.armL.rotation.z = 0.28;
      this.armR.rotation.z = -0.28;
    }

    // Body bob & lean
    const bob = this.isMoving ? Math.abs(Math.sin(walkCycle)) * 0.035 * (0.4 + speedRatio) : Math.sin(t * 1.7) * 0.012;
    this.model.position.y = bob;
    const lean = this.isMoving ? 0.05 + speedRatio * 0.1 : 0;
    this.model.rotation.x = THREE.MathUtils.lerp(this.model.rotation.x, lean, Math.min(1, dt * 6));
    this.torso.rotation.y = this.isMoving ? Math.sin(walkCycle) * 0.055 : Math.sin(t * 1.2) * 0.02;
    this.head.rotation.y = this.isMoving ? -Math.sin(walkCycle * 0.5) * 0.04 : Math.sin(t * 0.6) * 0.05;
    this.head.position.y = 1.46 + (this.isMoving ? Math.abs(Math.sin(walkCycle * 2)) * 0.008 : 0);

    // Cape and hair follow speed + wind
    const windFlutter = Math.sin(t * 2.4) * 0.045 + Math.sin(t * 5.1) * 0.015;
    const capeTarget = 0.16 + speedRatio * 0.55 + windFlutter + (this.grounded ? 0 : 0.35);
    this.cape.rotation.x += (capeTarget - this.cape.rotation.x) * Math.min(1, dt * 5);
    this.cape.rotation.z = Math.sin(t * 1.9) * 0.035 * (0.4 + speedRatio);
    this.ponytail.rotation.x = Math.sin(t * 2.1) * 0.09 + speedRatio * 0.22 + windFlutter;
    this.ponytail.rotation.z = Math.sin(t * 1.4) * 0.06;

    // Pendant glimmer
    this.pendantCrystal.rotation.y += dt * 1.4;
    this.pendantCrystal.position.y = Math.sin(t * 1.8) * 0.012;
    this.pendant.position.y = 1.2 + Math.sin(t * 1.5) * 0.008;
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
