/**
 * Third-person follow camera with collision, cinematic framing and gentle
 * orbit support for menus and cutscenes.
 */
import * as THREE from 'three';

const _raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _target = new THREE.Vector3();

export class CameraController {
  constructor(game) {
    this.game = game;
    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.12, 420);
    this.camera.position.set(0, 12, 24);

    this.yaw = Math.PI * 0.15;
    this.pitch = 0.42;
    this.distance = 5.6;
    this.minDistance = 2.4;
    this.maxDistance = 9.5;
    this.targetDistance = this.distance;
    this.followHeight = 1.5;
    this.baseFov = 52;

    this.target = new THREE.Vector3(0, 2, 0);
    this.smoothTarget = new THREE.Vector3(0, 2, 0);
    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.shakeSeed = Math.random() * 1000;

    this.cinematic = null;
    this.orbit = null;
    // Scaled down by the "reduced motion" setting: smaller shakes, slower orbit.
    this.cinematicDampScale = 1;
    this._rayTimer = 0;
    this._camDistance = this.distance;
    this._initialized = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const width = this.game.renderer.width || window.innerWidth;
    const height = this.game.renderer.height || window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    // Keep a comfortable horizontal field of view on very wide and very tall
    // displays (landscape-first, but tolerant of tablets).
    this.baseFov = this.camera.aspect > 2.1 ? 58 : 52;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  get yawAngle() {
    return this.yaw;
  }

  getForward() {
    return {
      x: -Math.sin(this.yaw),
      z: -Math.cos(this.yaw),
    };
  }

  getRight() {
    return {
      x: Math.cos(this.yaw),
      z: -Math.sin(this.yaw),
    };
  }

  addLook(dx, dy) {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy, -0.12, 1.05);
  }

  zoom(delta) {
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + delta, this.minDistance, this.maxDistance);
  }

  snapToPlayer() {
    const player = this.game.player;
    if (!player) return;
    this._initialized = false;
    this.target.set(player.position.x, player.position.y + this.followHeight, player.position.z);
    this.smoothTarget.copy(this.target);
    this.yaw = player.facing ?? this.yaw;
    this.updateCameraTransform(1, true);
    this._initialized = true;
  }

  shake(amount = 0.14, duration = 0.45) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  startOrbit({ center = [0, 0, 0], radius = 26, height = 12, speed = 0.05, lookHeight = 6 } = {}) {
    this.orbit = {
      center: new THREE.Vector3(center[0], center[1], center[2]),
      radius,
      height,
      speed,
      lookHeight,
      angle: Math.atan2(this.camera.position.x - center[0], this.camera.position.z - center[2]),
    };
    this.cinematic = null;
  }

  stopOrbit() {
    this.orbit = null;
  }

  enterCinematic({ position, lookAt, fov, damp = 2.2, immediate = false }) {
    this.orbit = null;
    this.cinematic = {
      position: new THREE.Vector3(...position),
      lookAt: new THREE.Vector3(...lookAt),
      fov: fov ?? this.baseFov,
      damp,
    };
    if (immediate) {
      this.camera.position.copy(this.cinematic.position);
      this.camera.lookAt(this.cinematic.lookAt);
      this.camera.fov = this.cinematic.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  moveCinematic({ position, lookAt, fov, damp = 2.2 }) {
    if (!this.cinematic) return this.enterCinematic({ position, lookAt, fov, damp });
    if (position) this.cinematic.position.set(position[0], position[1], position[2]);
    if (lookAt) this.cinematic.lookAt.set(lookAt[0], lookAt[1], lookAt[2]);
    if (Number.isFinite(fov)) this.cinematic.fov = fov;
    this.cinematic.damp = damp;
  }

  exitCinematic() {
    this.cinematic = null;
    this._initialized = false;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  get isCinematic() {
    return !!this.cinematic || !!this.orbit;
  }

  update(dt) {
    if (this.orbit) {
      this.orbit.angle += this.orbit.speed * dt * this.cinematicDampScale;
      const x = this.orbit.center.x + Math.sin(this.orbit.angle) * this.orbit.radius;
      const z = this.orbit.center.z + Math.cos(this.orbit.angle) * this.orbit.radius;
      const y = this.orbit.center.y + this.orbit.height;
      this.camera.position.lerp(new THREE.Vector3(x, y, z), 1 - Math.exp(-dt * 1.6));
      _target.set(this.orbit.center.x, this.orbit.center.y + this.orbit.lookHeight, this.orbit.center.z);
      this.camera.lookAt(_target);
      if (Math.abs(this.camera.fov - this.baseFov) > 0.1) {
        this.camera.fov += (this.baseFov - this.camera.fov) * Math.min(1, dt * 2);
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    const player = this.game.player;
    if (!player) return;

    if (this.cinematic) {
      const damp = this.cinematic.damp ?? 2.2;
      const k = 1 - Math.exp(-dt * damp);
      this.camera.position.lerp(this.cinematic.position, k);
      this.smoothTarget.lerp(this.cinematic.lookAt, k);
      this.camera.lookAt(this.smoothTarget);
      if (Math.abs(this.camera.fov - this.cinematic.fov) > 0.05) {
        this.camera.fov += (this.cinematic.fov - this.camera.fov) * Math.min(1, dt * 2.6);
        this.camera.updateProjectionMatrix();
      }
      this.applyShake(dt);
      return;
    }

    // Input look
    const look = this.game.input.consumeLookDelta();
    if (look.x || look.y) this.addLook(look.x, look.y);
    const zoomDelta = this.game.input.consumeZoom();
    if (zoomDelta) this.zoom(zoomDelta * 0.5);

    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 8);

    this.target.set(player.position.x, player.position.y + this.followHeight, player.position.z);
    if (!this._initialized) {
      this.smoothTarget.copy(this.target);
      this._initialized = true;
    } else {
      const k = 1 - Math.exp(-dt * 13);
      this.smoothTarget.lerp(this.target, k);
    }

    this.updateCameraTransform(dt, false);
    this.applyShake(dt);
  }

  updateCameraTransform(dt, snap = false) {
    const cosPitch = Math.cos(this.pitch);
    _dir.set(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    );
    _desired.copy(this.smoothTarget).addScaledVector(_dir, this.distance);

    // Keep the camera above the terrain.
    const ground = this.game.worlds?.getHeightAt(_desired.x, _desired.z);
    if (Number.isFinite(ground)) {
      _desired.y = Math.max(_desired.y, ground + 0.55);
    }

    // Collision: pull the camera in front of anything solid between it and us.
    this._rayTimer += dt;
    if (this._rayTimer > 0.08 || snap) {
      this._rayTimer = 0;
      this._camDistance = this._resolveCollision(_desired);
    }

    const factor = snap || !this._initialized ? 1 : 1 - Math.exp(-dt * 16);
    const finalPos = _target.copy(this.smoothTarget).addScaledVector(
      _dir,
      Math.min(this.distance, this._camDistance),
    );
    const groundFinal = this.game.worlds?.getHeightAt(finalPos.x, finalPos.z);
    if (Number.isFinite(groundFinal)) finalPos.y = Math.max(finalPos.y, groundFinal + 0.5);
    this.camera.position.lerp(finalPos, factor);
    this.camera.lookAt(this.smoothTarget);
    if (Math.abs(this.camera.fov - this.baseFov) > 0.08) {
      this.camera.fov += (this.baseFov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }

  _resolveCollision(desired) {
    const obstacles = this.game.worlds?.getCameraObstacles?.() || [];
    if (!obstacles.length) return this.distance;
    _dir.copy(desired).sub(this.smoothTarget);
    const maxDist = _dir.length();
    if (maxDist < 0.001) return maxDist;
    _dir.normalize();
    _raycaster.set(this.smoothTarget, _dir);
    _raycaster.far = maxDist;
    _raycaster.near = 0.05;
    let hits;
    try {
      hits = _raycaster.intersectObjects(obstacles, false);
    } catch {
      return maxDist;
    }
    if (hits.length) {
      const safe = Math.max(this.minDistance * 0.55, hits[0].distance - 0.35);
      return safe;
    }
    return maxDist;
  }

  applyShake(dt) {
    if (this.shakeTime <= 0) return;
    this.shakeTime -= dt;
    const falloff = Math.max(0, this.shakeTime);
    const t = performance.now() * 0.001 + this.shakeSeed;
    const amount = this.shakeAmount * falloff * this.cinematicDampScale;
    this.camera.position.x += Math.sin(t * 47) * amount;
    this.camera.position.y += Math.cos(t * 39) * amount * 0.7;
    this.camera.position.z += Math.sin(t * 53) * amount * 0.4;
    if (this.shakeTime <= 0) this.shakeAmount = 0;
  }
}
