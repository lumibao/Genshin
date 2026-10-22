/**
 * BaseWorld — shared scaffolding for every playable area.
 *
 * A world owns its Three.js group, colliders, interactables, minimap markers,
 * camera blockers and per-frame updatables. WorldManager handles loading,
 * atmosphere, disposal and handing data to the player/camera systems.
 */
import * as THREE from 'three';
import { FootstepDust } from './WorldKit.js';

export class BaseWorld {
  constructor({ game, level = 1 } = {}) {
    this.game = game;
    this.level = level;
    this.group = new THREE.Group();
    this.group.name = this.constructor.name;

    this.colliders = [];
    this.interactables = [];
    this.markers = [];
    this.cameraObstacles = [];
    this.updatables = [];
    this.spawns = { default: { x: 0, z: 0, yaw: Math.PI } };
    this.bounds = null;
    this.atmosphere = {
      fog: '#cbd9e2',
      fogNear: 45,
      fogFar: 170,
      background: '#b8cfdd',
    };
    this.surface = 'grass';
    this.music = 'meadow';
    this.ambience = 'meadow';
    this.time = 0;
    this.dust = new FootstepDust(this.group, '#d8d2bc');
    this._disposers = [];
  }

  /** Override in each world. */
  async build() {}

  heightAt() {
    return 0;
  }

  getSurface() {
    return this.surface;
  }

  groundY(x, z) {
    return this.heightAt(x, z);
  }

  /* ---------------------------------------------------------------- */
  /* Registration helpers                                             */
  /* ---------------------------------------------------------------- */

  add(object, { x = 0, z = 0, y = null, rotation = 0, scale = 1, parent = this.group, camera = false, castShadow = true, receiveShadow = true } = {}) {
    object.position.x = x;
    object.position.z = z;
    object.position.y = y === null ? this.heightAt(x, z) : y;
    object.rotation.y = rotation;
    if (scale !== 1) object.scale.multiplyScalar(scale);
    object.traverse((child) => {
      if (child.isMesh) {
        if (child.castShadow === false && castShadow === false) child.castShadow = false;
        else child.castShadow = castShadow;
        child.receiveShadow = receiveShadow;
      }
    });
    parent.add(object);
    if (camera) this.addCameraObstacle(object);
    return object;
  }

  addColliderBox(x, z, halfW, halfD, rotation = 0, meta = {}) {
    const collider = { type: 'box', x, z, halfW, halfD, rotation, ...meta };
    this.colliders.push(collider);
    return collider;
  }

  addColliderCircle(x, z, r, meta = {}) {
    const collider = { type: 'circle', x, z, r, ...meta };
    this.colliders.push(collider);
    return collider;
  }

  addCameraObstacle(object) {
    object.traverse((child) => {
      if (child.isMesh && !this.cameraObstacles.includes(child)) this.cameraObstacles.push(child);
    });
  }

  addUpdate(target) {
    if (!target) return;
    if (typeof target === 'function') this.updatables.push(target);
    else if (target.userData?.update) this.updatables.push(target.userData.update.bind(target.userData));
  }

  addInteractable({
    id,
    x,
    z,
    y = null,
    radius = 2.6,
    label = 'Interact',
    prompt = null,
    glyph = '✦',
    action = null,
    enabled = null,
    heightRange = 3.4,
    marker = null,
    object = null,
  }) {
    const item = {
      id,
      position: new THREE.Vector3(x, y === null ? this.heightAt(x, z) + 1 : y, z),
      radius,
      label,
      prompt,
      glyph,
      action,
      enabled,
      heightRange,
      object,
    };
    this.interactables.push(item);
    if (marker) {
      this.addMarker({ x, z, type: marker, label });
    }
    return item;
  }

  addMarker(marker) {
    this.markers.push({ ...marker, world: this.group.name });
  }

  updateMarker(id, changes) {
    const marker = this.markers.find((m) => m.id === id);
    if (marker) Object.assign(marker, changes);
  }

  removeMarker(id) {
    const index = this.markers.findIndex((m) => m.id === id);
    if (index !== -1) this.markers.splice(index, 1);
  }

  spawnFootstepDust(position) {
    this.dust?.emit(position, this.getSurface());
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  update(dt, time) {
    this.time = time;
    for (const update of this.updatables) {
      try {
        update(dt, time);
      } catch (err) {
        console.error('[World] updatable failed', err);
      }
    }
    this.dust?.update(dt);
  }

  /** Minimap shape data (paths, water, walls) — optional per world. */
  getMinimapData() {
    return { markers: this.markers, paths: [], shapes: [] };
  }

  dispose() {
    for (const disposer of this._disposers) {
      try {
        disposer();
      } catch {
        /* ignore */
      }
    }
    this._disposers = [];
    this.dust?.dispose();
    this.updatables = [];
    this.interactables = [];
    this.markers = [];
    this.cameraObstacles = [];
  }
}
