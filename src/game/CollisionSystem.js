/**
 * Lightweight 2D-on-the-ground collision (circles and oriented boxes).
 *
 * The player is a capsule in spirit: a circle resolved against props each
 * frame, with the vertical axis handled by terrain height sampling.
 */

export class CollisionSystem {
  constructor() {
    this.colliders = [];
    this.bounds = null; // { x, z, radius }
  }

  setColliders(colliders, bounds = null) {
    this.colliders = Array.isArray(colliders) ? colliders : [];
    this.bounds = bounds;
  }

  addCollider(collider) {
    if (collider) this.colliders.push(collider);
  }

  clear() {
    this.colliders = [];
    this.bounds = null;
  }

  static circle(x, z, r, meta = {}) {
    return { type: 'circle', x, z, r, ...meta };
  }

  static box(x, z, halfW, halfD, rotation = 0, meta = {}) {
    return { type: 'box', x, z, halfW, halfD, rotation, ...meta };
  }

  /**
   * Push a moving circle out of every collider it overlaps.
   * @param {{x:number,z:number}} position mutated in place.
   * @returns {boolean} whether a correction happened.
   */
  resolve(position, radius = 0.42) {
    let corrected = false;
    for (let iteration = 0; iteration < 3; iteration++) {
      let moved = false;
      for (const collider of this.colliders) {
        if (collider.disabled) continue;
        if (collider.type === 'circle') {
          const dx = position.x - collider.x;
          const dz = position.z - collider.z;
          const minDist = radius + collider.r;
          const distSq = dx * dx + dz * dz;
          if (distSq < minDist * minDist) {
            const dist = Math.sqrt(distSq) || 0.0001;
            const push = minDist - dist;
            position.x += (dx / dist) * push;
            position.z += (dz / dist) * push;
            moved = true;
            corrected = true;
          }
        } else if (collider.type === 'box') {
          const rotation = collider.rotation || 0;
          const cos = Math.cos(-rotation);
          const sin = Math.sin(-rotation);
          const localX = (position.x - collider.x) * cos - (position.z - collider.z) * sin;
          const localZ = (position.x - collider.x) * sin + (position.z - collider.z) * cos;
          const halfW = collider.halfW + radius;
          const halfD = collider.halfD + radius;

          if (Math.abs(localX) < halfW && Math.abs(localZ) < halfD) {
            const penX = halfW - Math.abs(localX);
            const penZ = halfD - Math.abs(localZ);
            let pushLocalX = 0;
            let pushLocalZ = 0;
            if (penX < penZ) pushLocalX = Math.sign(localX || 1) * penX;
            else pushLocalZ = Math.sign(localZ || 1) * penZ;

            const worldCos = Math.cos(rotation);
            const worldSin = Math.sin(rotation);
            position.x += pushLocalX * worldCos - pushLocalZ * worldSin;
            position.z += pushLocalX * worldSin + pushLocalZ * worldCos;
            moved = true;
            corrected = true;
          }
        }
      }
      if (!moved) break;
    }

    if (this.bounds && this.bounds.radius > 0) {
      const dx = position.x - this.bounds.x;
      const dz = position.z - this.bounds.z;
      const dist = Math.hypot(dx, dz);
      if (dist > this.bounds.radius) {
        position.x = this.bounds.x + (dx / dist) * this.bounds.radius;
        position.z = this.bounds.z + (dz / dist) * this.bounds.radius;
        corrected = true;
      }
    }

    return corrected;
  }

  isBlocked(x, z, radius = 0.4) {
    for (const collider of this.colliders) {
      if (collider.disabled) continue;
      if (collider.type === 'circle') {
        if (Math.hypot(x - collider.x, z - collider.z) < collider.r + radius) return true;
      } else if (collider.type === 'box') {
        const rotation = collider.rotation || 0;
        const cos = Math.cos(-rotation);
        const sin = Math.sin(-rotation);
        const localX = (x - collider.x) * cos - (z - collider.z) * sin;
        const localZ = (x - collider.x) * sin + (z - collider.z) * cos;
        if (Math.abs(localX) < collider.halfW + radius && Math.abs(localZ) < collider.halfD + radius) return true;
      }
    }
    return false;
  }
}
