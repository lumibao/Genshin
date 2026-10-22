/**
 * Loads, swaps and disposes worlds.
 *
 * Later chapters are imported dynamically so the meadow has a fast first
 * paint and the library never exists in memory until it is needed.
 */
const WORLD_LOADERS = {
  mondstadt: () => import('../worlds/MondstadtWorld.js').then((m) => m.MondstadtWorld),
  whisperingWoods: () => import('../worlds/WhisperingWoods.js').then((m) => m.WhisperingWoods),
  ancientRuins: () => import('../worlds/AncientRuins.js').then((m) => m.AncientRuins),
  archive: () => import('../worlds/ForgottenLibrary.js').then((m) => m.SealedArchive),
  hiddenLibrary: () => import('../worlds/ForgottenLibrary.js').then((m) => m.HiddenLibrary),
  observatory: () => import('../worlds/CelestialObservatory.js').then((m) => m.CelestialObservatory),
  sanctuary: () => import('../worlds/CelestialSanctuary.js').then((m) => m.CelestialSanctuary),
};

export class WorldManager {
  constructor(game) {
    this.game = game;
    this.current = null;
    this.currentId = null;
    this.interactables = [];
    this.loading = false;
    this._pending = null;
    this._cache = new Map();
  }

  hasWorld(id) {
    return !!WORLD_LOADERS[id];
  }

  async _getClass(id) {
    if (!this._cache.has(id)) {
      const loader = WORLD_LOADERS[id];
      if (!loader) throw new Error(`Unknown world "${id}"`);
      this._cache.set(id, loader());
    }
    return this._cache.get(id);
  }

  async enter(worldId, { level = null, onSpawn = null } = {}) {
    if (this.loading) {
      this._pending = { worldId, level, onSpawn };
      return null;
    }
    if (!WORLD_LOADERS[worldId]) throw new Error(`Unknown world "${worldId}"`);

    this.loading = true;
    const started = performance.now();
    const slowTimer = setTimeout(() => {
      if (this.loading) this.game.setLoading?.(true, 'The wind carries you onward…', 'Preparing the next place');
    }, 260);

    try {
      const WorldClass = await this._getClass(worldId);

      // Tear down the previous area completely (geometry, materials, lights).
      if (this.current) {
        try {
          this.current.dispose();
        } catch (err) {
          console.warn('[World] dispose failed', err);
        }
      }
      this.game.sceneManager.clearWorld();
      this.current = null;
      this.currentId = null;
      this.interactables = [];
      this.game.collision.clear();
      this.game.interactions?.refresh();

      const world = new WorldClass({ game: this.game, level: level ?? this.game.state?.level ?? 1 });
      await world.build();

      this.game.sceneManager.addWorldGroup(world.group);
      this.game.sceneManager.setAtmosphere(world.atmosphere);
      this.game.collision.setColliders(world.colliders, world.bounds);

      this.current = world;
      this.currentId = worldId;
      this.interactables = world.interactables;

      this.game.audio?.setScene({ music: world.music, ambience: world.ambience });
      this.game.bus.emit('world:entered', { id: worldId, world });
      onSpawn?.(world);

      return world;
    } finally {
      clearTimeout(slowTimer);
      const elapsed = performance.now() - started;
      this.loading = false;
      if (elapsed > 260) this.game.setLoading?.(false);
      if (this._pending) {
        const pending = this._pending;
        this._pending = null;
        // Defer so the current call can finish unwinding.
        setTimeout(() => this.enter(pending.worldId, pending), 30);
      }
    }
  }

  getHeightAt(x, z) {
    return this.current ? this.current.heightAt(x, z) : 0;
  }

  getSurface() {
    return this.current?.getSurface() || 'grass';
  }

  getCameraObstacles() {
    return this.current?.cameraObstacles || [];
  }

  getMarkers() {
    return this.current?.markers || [];
  }

  getMinimapData() {
    return this.current?.getMinimapData() || { markers: [], paths: [], shapes: [] };
  }

  update(dt, time) {
    this.current?.update(dt, time);
  }

  dispose() {
    this.current?.dispose();
    this.game.sceneManager.clearWorld();
    this.current = null;
    this.currentId = null;
    this.interactables = [];
  }
}
