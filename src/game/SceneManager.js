/**
 * Owns the Three.js scene and the atmospheric settings shared by all worlds:
 * fog, background colour, exposure hints and disposal of world contents.
 */
import * as THREE from 'three';

export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8fb6d8');
    this.scene.fog = new THREE.Fog('#cbd9e2', 40, 190);
    this.worldRoot = new THREE.Group();
    this.worldRoot.name = 'worldRoot';
    this.scene.add(this.worldRoot);
    this._defaultFog = { color: '#cbd9e2', near: 40, far: 190 };
  }

  setAtmosphere({ fog, fogNear, fogFar, background, exposure } = {}) {
    if (background !== undefined) {
      this.scene.background = new THREE.Color(background);
    }
    if (fog === false) {
      this.scene.fog = null;
    } else if (fog) {
      this.scene.fog = new THREE.Fog(fog, fogNear ?? 40, fogFar ?? 190);
    }
    if (Number.isFinite(exposure)) {
      this.scene.userData.exposure = exposure;
    }
  }

  resetAtmosphere() {
    this.setAtmosphere({
      fog: this._defaultFog.color,
      fogNear: this._defaultFog.near,
      fogFar: this._defaultFog.far,
      background: this._defaultFog.color,
    });
  }

  addWorldGroup(group) {
    this.worldRoot.add(group);
  }

  clearWorld() {
    for (const child of [...this.worldRoot.children]) {
      this.worldRoot.remove(child);
      disposeObject3D(child);
    }
    this.scene.fog = null;
  }

  get sceneRef() {
    return this.scene;
  }
}

/** Recursively dispose geometries, materials and textures of a subtree. */
export function disposeObject3D(root) {
  if (!root) return;
  root.traverse?.((object) => {
    if (object.geometry && typeof object.geometry.dispose === 'function') {
      // Instanced/shared geometry may be referenced elsewhere; dispose is safe
      // because each world rebuilds its own resources on entry.
      object.geometry.dispose();
    }
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      for (const key of Object.keys(material)) {
        const value = material[key];
        if (value && value.isTexture && !value.userData?.shared) {
          value.dispose();
        }
      }
      if (material.uniforms) {
        for (const uniform of Object.values(material.uniforms)) {
          if (uniform?.value?.isTexture && !uniform.value.userData?.shared) uniform.value.dispose();
        }
      }
      material.dispose?.();
    }
    if (object.isPoints && object.geometry) {
      object.geometry.dispose();
    }
  });
  root.parent?.remove(root);
}
