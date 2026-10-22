/**
 * WorldKit — the shared vocabulary of props and effects every world is built
 * from. Keeping these here is what makes five areas feel like one game.
 *
 * Everything returns plain Three.js objects; worlds are responsible for
 * colliders and interactables.
 */
import * as THREE from 'three';
import {
  bannerTexture,
  blobShadowTexture,
  cloudTexture,
  glowTexture,
  metalTexture,
  parchmentTexture,
  runeRingTexture,
  sparkleTexture,
  stoneTexture,
  woodTexture,
  pageEdgeTexture,
  bookLeatherTexture,
} from '../game/Textures.js';

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function rng(seed = 1) {
  let a = seed >>> 0;
  return function random() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mat(params) {
  return new THREE.MeshStandardMaterial(params);
}

export function markShadows(object, cast = true, receive = true) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
  return object;
}

/* ------------------------------------------------------------------ */
/* Sky                                                                 */
/* ------------------------------------------------------------------ */

const SKY_VERT = /* glsl */ `
  varying vec3 vWorldDirection;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldDirection = normalize(world.xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uExponent;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vWorldDirection;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 dir = normalize(vWorldDirection);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    float gradient = pow(clamp(dir.y, 0.0, 1.0), uExponent);
    vec3 color = mix(uHorizon, uTop, gradient);
    color = mix(uBottom, color, smoothstep(-0.12, 0.16, dir.y));

    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    color += uSunColor * pow(sunDot, 220.0) * 1.4;
    color += uSunColor * pow(sunDot, 8.0) * 0.16;

    if (uStars > 0.0) {
      vec3 cell = floor(dir * 260.0);
      float star = step(0.9975, hash(cell));
      float twinkle = 0.55 + 0.45 * sin(uTime * 1.6 + hash(cell + 4.0) * 6.283);
      color += vec3(0.9, 0.95, 1.0) * star * twinkle * uStars * smoothstep(0.02, 0.35, dir.y);
    }

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Gradient sky dome with optional stars and sun disc. */
export function createSky({
  top = '#5f9fd6',
  bottom = '#bcd6e4',
  horizon = '#e9e2cd',
  sunColor = '#fff3d2',
  sunDir = [0.5, 0.55, -0.4],
  stars = 0,
  exponent = 0.85,
  radius = 300,
} = {}) {
  const group = new THREE.Group();
  group.name = 'sky';
  const uniforms = {
    uTop: { value: new THREE.Color(top) },
    uBottom: { value: new THREE.Color(bottom) },
    uHorizon: { value: new THREE.Color(horizon) },
    uSunColor: { value: new THREE.Color(sunColor) },
    uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
    uExponent: { value: exponent },
    uStars: { value: stars },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), material);
  dome.frustumCulled = false;
  group.add(dome);
  group.userData.uniforms = uniforms;
  group.userData.update = (dt, time) => {
    uniforms.uTime.value = time;
  };
  return group;
}

/** Billboard cloud puffs drifting over the horizon. */
export function createClouds({ count = 12, radius = 170, height = 60, scale = 46, seed = 7, opacity = 0.85, color = '#ffffff' } = {}) {
  const group = new THREE.Group();
  group.name = 'clouds';
  const random = rng(seed);
  const texture = cloudTexture(seed);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity,
    color: new THREE.Color(color),
    fog: false,
  });
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const sprite = new THREE.Sprite(material.clone());
    const angle = (i / count) * Math.PI * 2 + random() * 0.4;
    const dist = radius * (0.6 + random() * 0.5);
    const s = scale * (0.55 + random() * 0.8);
    sprite.position.set(Math.cos(angle) * dist, height + random() * 46, Math.sin(angle) * dist);
    sprite.scale.set(s * 1.9, s, 1);
    sprite.material.opacity = opacity * (0.5 + random() * 0.5);
    sprite.userData.speed = 0.35 + random() * 0.5;
    sprite.userData.angle = angle;
    sprite.userData.dist = dist;
    group.add(sprite);
    clouds.push(sprite);
  }
  group.userData.update = (dt) => {
    for (const cloud of clouds) {
      cloud.userData.angle += (dt * cloud.userData.speed) / cloud.userData.dist;
      cloud.position.x = Math.cos(cloud.userData.angle) * cloud.userData.dist;
      cloud.position.z = Math.sin(cloud.userData.angle) * cloud.userData.dist;
    }
  };
  return group;
}

/* ------------------------------------------------------------------ */
/* Terrain                                                             */
/* ------------------------------------------------------------------ */

/**
 * Heightfield terrain with vertex-coloured grass, dirt and rock bands.
 * `heightFn(x, z)` is the collision source of truth for the world.
 */
export function createTerrain({
  size = 150,
  segments = 110,
  heightFn = () => 0,
  colorFn = null,
  palette = ['#6f9a4e', '#7ca656', '#5d8544', '#8bab5c'],
  seed = 3,
  receiveShadow = true,
} = {}) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const random = rng(seed);
  const color = new THREE.Color();
  const shades = palette.map((hex) => new THREE.Color(hex));

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = heightFn(x, z);
    position.setY(i, y);

    if (colorFn) {
      const c = colorFn(x, z, y);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    } else {
      const slope = Math.abs(heightFn(x + 1.4, z) - y) + Math.abs(heightFn(x, z + 1.4) - y);
      const base = shades[Math.floor(random() * shades.length)];
      color.copy(base);
      if (slope > 1.1) color.lerp(new THREE.Color('#8c8a7c'), Math.min(0.7, slope * 0.25));
      const variation = 0.9 + random() * 0.16;
      colors[i * 3] = color.r * variation;
      colors[i * 3 + 1] = color.g * variation;
      colors[i * 3 + 2] = color.b * variation;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Grass                                                               */
/* ------------------------------------------------------------------ */

const GRASS_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uWindStrength;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uSunDir;
  attribute vec3 aTint;
  varying vec3 vColor;
  varying float vFog;
  varying float vHeight;

  void main() {
    vec3 p = position;
    #ifdef USE_INSTANCING
      vec3 origin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float phase = origin.x * 0.35 + origin.z * 0.27;
      float sway = sin(uTime * 1.25 + phase) * 0.14 + sin(uTime * 2.65 + phase * 1.7) * 0.055;
      p.x += sway * p.y * p.y * uWindStrength;
      p.z += sway * 0.55 * p.y * p.y * uWindStrength;
      vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
    #else
      vec4 world = modelMatrix * vec4(p, 1.0);
    #endif

    vec4 mv = viewMatrix * world;
    vec3 normal = normalize(vec3(0.0, 1.0, 0.0));
    float light = 0.62 + 0.38 * clamp(dot(normal, normalize(uSunDir)), 0.0, 1.0);
    float vertical = 0.72 + 0.42 * clamp(position.y / 0.55, 0.0, 1.0);
    vColor = aTint * light * vertical;
    vHeight = position.y;
    vFog = smoothstep(uFogNear, uFogFar, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const GRASS_FRAG = /* glsl */ `
  uniform vec3 uFogColor;
  varying vec3 vColor;
  varying float vFog;
  void main() {
    vec3 color = mix(vColor, uFogColor, vFog);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

function makeGrassBladeGeometry() {
  const positions = [];
  const colors = [];
  const tints = [
    [0.36, 0.52, 0.26],
    [0.44, 0.6, 0.3],
    [0.3, 0.45, 0.23],
  ];
  for (let b = 0; b < 3; b++) {
    const angle = (b / 3) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const w = 0.045;
    const lean = 0.12;
    const h = 0.42 + b * 0.09;
    const baseX = Math.cos(angle + 1.1) * 0.05;
    const baseZ = Math.sin(angle + 1.1) * 0.05;
    // Two triangles per blade for a slight taper.
    const verts = [
      [baseX - cos * w, 0, baseZ - sin * w],
      [baseX + cos * w, 0, baseZ + sin * w],
      [baseX + cos * lean, h * 0.55, baseZ + sin * lean],
      [baseX + cos * lean, h * 0.55, baseZ + sin * lean],
      [baseX - cos * w * 0.6, h * 0.55, baseZ - sin * w * 0.6],
      [baseX + cos * lean * 1.6, h, baseZ + sin * lean * 1.6],
    ];
    const tint = tints[b];
    for (const v of verts) {
      positions.push(v[0], v[1], v[2]);
      const dark = 0.6 + (v[1] / h) * 0.55;
      colors.push(tint[0] * dark, tint[1] * dark, tint[2] * dark);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Instanced wind-blown grass. `heightFn` places blades on the terrain,
 * `filterFn` keeps them off paths and buildings.
 */
export function createGrassField({
  count = 7000,
  radius = 52,
  center = [0, 0],
  heightFn = () => 0,
  filterFn = () => true,
  scaleRange = [0.8, 1.6],
  seed = 11,
  fogColor = '#cbd9e2',
  fogNear = 40,
  fogFar = 170,
  sunDir = [0.5, 0.7, -0.3],
  windStrength = 1,
} = {}) {
  const random = rng(seed);
  const geometry = makeGrassBladeGeometry();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWindStrength: { value: windStrength },
      uFogColor: { value: new THREE.Color(fogColor) },
      uFogNear: { value: fogNear },
      uFogFar: { value: fogFar },
      uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
    },
    vertexShader: GRASS_VERT,
    fragmentShader: GRASS_FRAG,
    side: THREE.DoubleSide,
  });

  const dummy = new THREE.Object3D();
  const tintArray = new Float32Array(count * 3);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'grass';
  mesh.frustumCulled = false; // world-scale field; grass is cheap enough
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 6) {
    attempts++;
    const angle = random() * Math.PI * 2;
    const dist = Math.sqrt(random()) * radius;
    const x = center[0] + Math.cos(angle) * dist;
    const z = center[1] + Math.sin(angle) * dist;
    if (!filterFn(x, z)) continue;
    const y = heightFn(x, z);
    dummy.position.set(x, y - 0.02, z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    const s = scaleRange[0] + random() * (scaleRange[1] - scaleRange[0]);
    dummy.scale.set(s, s * (0.85 + random() * 0.4), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    const shade = 0.82 + random() * 0.34;
    tintArray[placed * 3] = 0.44 * shade;
    tintArray[placed * 3 + 1] = 0.63 * shade;
    tintArray[placed * 3 + 2] = 0.33 * shade;
    placed++;
  }
  mesh.count = placed;
  geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tintArray, 3));
  mesh.instanceMatrix.needsUpdate = true;

  mesh.userData.update = (dt, time) => {
    material.uniforms.uTime.value = time;
  };
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Trees                                                               */
/* ------------------------------------------------------------------ */

/** A single detailed tree (used for hero trees near the player's path). */
export function createTree({
  height = 5.6,
  trunkColor = '#6b5138',
  leafColors = ['#4f7c46', '#5f8f4f', '#436e3f'],
  seed = 1,
  canopy = 3,
  glow = false,
} = {}) {
  const random = rng(seed);
  const group = new THREE.Group();
  const trunkMat = mat({ color: trunkColor, roughness: 0.95 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.33, height * 0.72, 7), trunkMat);
  trunk.position.y = (height * 0.72) / 2;
  trunk.rotation.z = (random() - 0.5) * 0.06;
  group.add(trunk);

  const branchMat = trunkMat;
  for (let i = 0; i < 2; i++) {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, height * 0.3, 5), branchMat);
    branch.position.set(0, height * (0.55 + i * 0.12), 0);
    branch.rotation.z = (i ? 1 : -1) * (0.6 + random() * 0.24);
    branch.rotation.y = random() * Math.PI;
    group.add(branch);
  }

  const leafMats = leafColors.map((c) => mat({ color: c, roughness: 0.9, flatShading: true }));
  for (let i = 0; i < canopy; i++) {
    const r = height * (0.22 + random() * 0.14);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[i % leafMats.length]);
    leaf.position.set(
      (random() - 0.5) * height * 0.34,
      height * (0.66 + random() * 0.3),
      (random() - 0.5) * height * 0.34,
    );
    leaf.scale.y = 0.82 + random() * 0.2;
    leaf.rotation.set(random(), random(), random());
    if (glow) leafMats[i % leafMats.length].emissive = new THREE.Color('#2c4a2a');
    group.add(leaf);
  }
  group.userData.sway = (t) => {
    group.rotation.z = Math.sin(t * 0.9 + seed) * 0.006;
  };
  return group;
}

/** Efficient forest: two instanced meshes for trunks and canopies. */
export function createTreeBatch(specs, { trunkColor = '#5f4a34', leafColors = ['#4f7c46', '#5d8a4d', '#3f6a3f'] } = {}) {
  const group = new THREE.Group();
  group.name = 'forest';
  if (!specs.length) return group;

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = mat({ color: trunkColor, roughness: 0.95 });
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, specs.length);

  const leafGeo = new THREE.IcosahedronGeometry(1, 1);
  const leafMat = mat({ color: '#ffffff', roughness: 0.9, flatShading: true, vertexColors: false });
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, specs.length);
  leafMesh.castShadow = true;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  specs.forEach((spec, i) => {
    const height = spec.height || 5.4;
    dummy.position.set(spec.x, spec.y ?? 0, spec.z);
    dummy.rotation.set(0, spec.rotation ?? 0, 0);
    dummy.scale.set(height * 0.34, height * 0.72, height * 0.34);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);

    const canopyR = height * (0.3 + (spec.canopy ?? 1) * 0.06);
    dummy.position.set(spec.x, (spec.y ?? 0) + height * 0.78, spec.z);
    dummy.rotation.set((spec.tilt ?? 0) * 0.4, spec.rotation ?? 0, 0);
    dummy.scale.set(canopyR * 1.12, canopyR * 0.92, canopyR * 1.12);
    dummy.updateMatrix();
    leafMesh.setMatrixAt(i, dummy.matrix);
    color.set(leafColors[i % leafColors.length]);
    const shade = 0.86 + ((i * 37) % 13) / 60;
    color.multiplyScalar(shade);
    leafMesh.setColorAt(i, color);
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  leafMesh.instanceMatrix.needsUpdate = true;
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  group.add(trunkMesh, leafMesh);
  group.userData.leafMesh = leafMesh;
  return group;
}

/* ------------------------------------------------------------------ */
/* Rocks and ground detail                                             */
/* ------------------------------------------------------------------ */

export function createRock({ scale = 1, seed = 2, color = '#8b887c' } = {}) {
  const random = rng(seed);
  const geo = new THREE.DodecahedronGeometry(scale, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) * (0.8 + random() * 0.45),
      pos.getY(i) * (0.62 + random() * 0.4),
      pos.getZ(i) * (0.8 + random() * 0.4),
    );
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, mat({ color, roughness: 1, flatShading: true }));
  rock.rotation.y = random() * Math.PI;
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

export function createBush({ scale = 1, seed = 4, colors = ['#527f45', '#5f8d4e'] } = {}) {
  const random = rng(seed);
  const group = new THREE.Group();
  const material = mat({ color: colors[Math.floor(random() * colors.length)], roughness: 0.95, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(scale * (0.34 + random() * 0.2), 0), material);
    mesh.position.set((random() - 0.5) * scale * 0.7, scale * (0.2 + random() * 0.18), (random() - 0.5) * scale * 0.7);
    mesh.scale.y = 0.8;
    group.add(mesh);
  }
  return group;
}

export function createFlower({ color = '#e8d9a8', stem = '#5f8447', seed = 1 } = {}) {
  const random = rng(seed);
  const group = new THREE.Group();
  const stemMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.016, 0.34, 4),
    mat({ color: stem, roughness: 0.9 }),
  );
  stemMesh.position.y = 0.17;
  group.add(stemMesh);
  const petalMat = mat({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.7 });
  for (let i = 0; i < 4; i++) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), petalMat);
    const a = (i / 4) * Math.PI * 2 + random();
    petal.position.set(Math.cos(a) * 0.05, 0.35, Math.sin(a) * 0.05);
    petal.scale.set(1, 0.45, 1);
    group.add(petal);
  }
  return group;
}

/* ------------------------------------------------------------------ */
/* Architecture                                                        */
/* ------------------------------------------------------------------ */

export function createWindmill({ height = 15, bladeCount = 4, seed = 1 } = {}) {
  const random = rng(seed);
  const group = new THREE.Group();
  const stone = mat({ map: stoneTexture('warm'), roughness: 0.95 });
  const wood = mat({ map: woodTexture(), roughness: 0.9 });
  const roofMat = mat({ color: '#7a4a38', roughness: 0.85 });

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.4, height, 10), stone);
  tower.position.y = height / 2;
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.6, 10), roofMat);
  roof.position.y = height + 1.2;
  roof.castShadow = true;
  group.add(roof);

  const hub = new THREE.Group();
  hub.position.set(0, height + 0.4, 2.3);
  group.add(hub);

  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.6, 8), wood);
  axle.rotation.x = Math.PI / 2;
  axle.position.z = -1;
  hub.add(axle);

  const blades = new THREE.Group();
  blades.position.z = 0.35;
  hub.add(blades);
  const bladeGeo = new THREE.BoxGeometry(0.95, 6.2, 0.14);
  const frameGeo = new THREE.BoxGeometry(0.16, 5.4, 0.1);
  for (let i = 0; i < bladeCount; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i / bladeCount) * Math.PI * 2;
    const sail = new THREE.Mesh(bladeGeo, mat({ color: '#e8ddc4', roughness: 0.9, side: THREE.DoubleSide }));
    sail.position.set(1.0, 3.3, 0);
    const frame = new THREE.Mesh(frameGeo, wood);
    frame.position.set(0.5, 3.0, 0.05);
    arm.add(sail, frame);
    blades.add(arm);
  }
  blades.rotation.z = random() * Math.PI;

  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 0.3), wood);
  door.position.set(0, 0.95, 2.2);
  group.add(door);

  group.userData.spin = (dt, speed = 0.35) => {
    blades.rotation.z += dt * speed;
  };
  return group;
}

export function createHouse({ width = 5, height = 3.4, depth = 4.4, roofColor = '#7d4c3a', wallColor = '#e7ddc6' } = {}) {
  const group = new THREE.Group();
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    mat({ color: wallColor, roughness: 0.94 }),
  );
  walls.position.y = height / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(width * 0.82, height * 0.7, 4), mat({ color: roofColor, roughness: 0.9 }));
  roof.position.y = height + height * 0.34;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = depth / width;
  roof.castShadow = true;
  group.add(roof);

  const beamMat = mat({ map: woodTexture('dark'), roughness: 0.9 });
  for (const x of [-width / 2 + 0.2, width / 2 - 0.2]) {
    for (const z of [-depth / 2 + 0.2, depth / 2 - 0.2]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, height, 0.22), beamMat);
      beam.position.set(x, height / 2, z);
      group.add(beam);
    }
  }

  const windowMat = new THREE.MeshStandardMaterial({
    color: '#ffdda4',
    emissive: '#ffc978',
    emissiveIntensity: 1.1,
    roughness: 0.4,
  });
  for (const x of [-width * 0.24, width * 0.24]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.08), windowMat);
    win.position.set(x, height * 0.58, depth / 2 + 0.02);
    group.add(win);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.9, 0.12), beamMat);
  door.position.set(0, 0.95, depth / 2 + 0.03);
  group.add(door);
  return group;
}

export function createPillar({ height = 6, radius = 0.55, broken = false, seed = 3 } = {}) {
  const random = rng(seed);
  const group = new THREE.Group();
  const material = mat({ map: stoneTexture(), roughness: 1 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.6, 0.5, radius * 2.6), material);
  base.position.y = 0.25;
  group.add(base);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius, height, 9), material);
  shaft.position.y = height / 2 + 0.4;
  if (broken) {
    shaft.scale.y = 0.6 + random() * 0.3;
    shaft.position.y = (height * shaft.scale.y) / 2 + 0.4;
    shaft.rotation.z = (random() - 0.5) * 0.14;
  }
  group.add(shaft);
  if (!broken) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.4, 0.42, radius * 2.4), material);
    cap.position.y = height + 0.6;
    group.add(cap);
  }
  markShadows(group);
  return group;
}

export function createArch({ width = 6, height = 7, depth = 1.4, seed = 5 } = {}) {
  const group = new THREE.Group();
  const material = mat({ map: stoneTexture(), roughness: 1 });
  const legGeo = new THREE.BoxGeometry(depth, height, depth);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, material);
    leg.position.set((side * width) / 2, height / 2, 0);
    group.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(depth * 1.5, 0.5, depth * 1.5), material);
    foot.position.set((side * width) / 2, 0.25, 0);
    group.add(foot);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + depth, depth * 0.9, depth), material);
  lintel.position.y = height + depth * 0.3;
  group.add(lintel);

  // Keystone
  const key = new THREE.Mesh(new THREE.BoxGeometry(depth * 0.9, depth * 1.1, depth * 1.2), mat({ color: '#8e8a7c', roughness: 1 }));
  key.position.y = height + depth * 0.75;
  group.add(key);

  // Moss patches
  const mossMat = new THREE.MeshStandardMaterial({ color: '#5f7c46', transparent: true, opacity: 0.75, roughness: 1 });
  const random = rng(seed);
  for (let i = 0; i < 8; i++) {
    const moss = new THREE.Mesh(new THREE.CircleGeometry(0.4 + random() * 0.6, 6), mossMat);
    moss.position.set(
      (random() > 0.5 ? 1 : -1) * (width / 2 + (random() - 0.5) * 0.2),
      0.6 + random() * (height * 0.7),
      depth / 2 + 0.01,
    );
    moss.rotation.z = random() * Math.PI;
    group.add(moss);
  }
  markShadows(group);
  return group;
}

export function createWallSegment({ length = 6, height = 2.2, thickness = 0.7, seed = 1 } = {}) {
  const group = new THREE.Group();
  const material = mat({ map: stoneTexture(), roughness: 1 });
  const blocks = Math.ceil(length / 1.4);
  const random = rng(seed);
  for (let i = 0; i < blocks; i++) {
    const h = height * (0.55 + random() * 0.5);
    const block = new THREE.Mesh(new THREE.BoxGeometry(length / blocks - 0.06, h, thickness), material);
    block.position.set(-length / 2 + (i + 0.5) * (length / blocks), h / 2, 0);
    block.rotation.y = (random() - 0.5) * 0.06;
    group.add(block);
  }
  markShadows(group);
  return group;
}

export function createBridge({ length = 12, width = 3.4 } = {}) {
  const group = new THREE.Group();
  const wood = mat({ map: woodTexture(), roughness: 0.92 });
  const planks = Math.round(length / 0.7);
  for (let i = 0; i < planks; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, 0.6), wood);
    plank.position.set(0, 0, -length / 2 + (i + 0.5) * (length / planks));
    plank.rotation.x = (i % 3 - 1) * 0.004;
    plank.receiveShadow = true;
    group.add(plank);
  }
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, length), wood);
    rail.position.set((side * width) / 2, 0.95, 0);
    group.add(rail);
    const postGeo = new THREE.BoxGeometry(0.14, 1.0, 0.14);
    for (let i = 0; i <= 4; i++) {
      const post = new THREE.Mesh(postGeo, wood);
      post.position.set((side * width) / 2, 0.5, -length / 2 + (i / 4) * length);
      group.add(post);
    }
  }
  markShadows(group, false, true);
  return group;
}

export function createStonePath(points, { width = 2.4, seed = 9, color = '#a49a86' } = {}) {
  const group = new THREE.Group();
  const random = rng(seed);
  const material = mat({ color, roughness: 1, flatShading: true });
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.round(length / 1.4));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = a[0] + dx * t;
      const z = a[1] + dz * t;
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.5, width * 0.52, 0.12, 7), material);
      stone.position.set(x + (random() - 0.5) * 0.6, 0.04, z + (random() - 0.5) * 0.6);
      stone.rotation.y = random() * Math.PI;
      stone.scale.x = 0.8 + random() * 0.4;
      stone.receiveShadow = true;
      group.add(stone);
    }
  }
  return group;
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

/** Treasure chest with a hinged lid. */
export function createChest({ scale = 1, woodColor = '#7a5231', goldColor = '#d9b877' } = {}) {
  const group = new THREE.Group();
  const wood = mat({ color: woodColor, roughness: 0.86 });
  const gold = mat({ color: goldColor, metalness: 0.85, roughness: 0.3, map: metalTexture() });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.62, 0.78), wood);
  base.position.y = 0.31;
  group.add(base);

  for (const x of [-0.42, 0.42]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.66, 0.82), gold);
    band.position.set(x, 0.31, 0);
    group.add(band);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.1), gold);
  lock.position.set(0, 0.38, 0.42);
  group.add(lock);

  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.62, -0.39);
  group.add(lidPivot);

  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 1.15, 12, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2;
  lid.position.set(0, 0, 0.39);
  lidPivot.add(lid);

  for (const x of [-0.42, 0.42]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.09, 12, 1, true, 0, Math.PI), gold);
    band.rotation.z = Math.PI / 2;
    band.position.set(x, 0, 0.39);
    lidPivot.add(band);
  }

  // Glow inside
  const inner = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.6),
    new THREE.MeshBasicMaterial({ color: '#ffe6ad', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.66;
  group.add(inner);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture('#ffe4a8'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.scale.set(3, 3, 1);
  glow.position.y = 0.9;
  group.add(glow);

  markShadows(group);
  group.scale.setScalar(scale);

  let openAmount = 0;
  let target = 0;
  group.userData.isOpen = false;
  group.userData.open = () => {
    target = 1;
    group.userData.isOpen = true;
  };
  group.userData.update = (dt) => {
    if (Math.abs(target - openAmount) > 0.001) {
      openAmount += (target - openAmount) * Math.min(1, dt * 6);
      lidPivot.rotation.x = -openAmount * 1.95;
      inner.material.opacity = openAmount * 0.75;
      glow.material.opacity = openAmount * 0.85;
      glow.scale.setScalar(3 + Math.sin(openAmount * Math.PI) * 0.8);
    }
  };
  return group;
}

export function createPedestal({ height = 1.15, radius = 0.85, color = '#9b968a' } = {}) {
  const group = new THREE.Group();
  const material = mat({ map: stoneTexture(), roughness: 0.95 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.15, radius * 1.3, 0.18, 8), material);
  base.position.y = 0.09;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius * 0.82, height - 0.3, 8), material);
  shaft.position.y = height / 2;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.82, 0.18, 8), material);
  top.position.y = height - 0.09;

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.95, 0.028, 5, 24),
    new THREE.MeshStandardMaterial({ color: '#d9bd82', metalness: 0.8, roughness: 0.35, emissive: '#7c6534', emissiveIntensity: 0.4 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = height + 0.01;

  group.add(base, shaft, top, rim);
  markShadows(group);
  return group;
}

export function createTorch({ height = 2.3, withLight = false, tint = '#ffb45e' } = {}) {
  const group = new THREE.Group();
  const metal = mat({ color: '#5a4c3a', metalness: 0.7, roughness: 0.45 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, height, 6), metal);
  pole.position.y = height / 2;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.24, 8), metal);
  cup.position.y = height;
  const flame = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(tint),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.95,
    }),
  );
  flame.position.y = height + 0.24;
  flame.scale.set(0.72, 1.15, 1);
  group.add(pole, cup, flame);
  markShadows(group, false, false);

  let light = null;
  if (withLight) {
    light = new THREE.PointLight(tint, 7, 11, 2);
    light.position.y = height + 0.3;
    group.add(light);
  }
  group.userData.update = (dt, time) => {
    const flicker = 0.9 + Math.sin(time * 9.3 + height) * 0.09 + Math.sin(time * 21.7) * 0.04;
    flame.scale.set(0.72 * flicker, 1.15 * flicker, 1);
    if (light) light.intensity = 6.2 + flicker * 1.6;
  };
  return group;
}

/** Long bookshelf filled with instanced books. */
export function createBookshelf({
  width = 6,
  height = 4.2,
  depth = 0.7,
  shelves = 4,
  seed = 1,
  withBooks = true,
  bookColors = ['#6b3f34', '#3f5468', '#5a4a30', '#4a3c58', '#6a5b3a', '#7a4436'],
} = {}) {
  const group = new THREE.Group();
  const wood = mat({ map: woodTexture('dark'), roughness: 0.9 });
  const darkWood = mat({ color: '#3b2a1d', roughness: 0.95 });
  const random = rng(seed);

  const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.12), darkWood);
  back.position.set(0, height / 2, -depth / 2);
  group.add(back);

  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.16, height, depth), wood);
    panel.position.set((side * width) / 2, height / 2, 0);
    group.add(panel);
  }
  for (let i = 0; i <= shelves; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, depth), wood);
    shelf.position.set(0, (i / shelves) * height, 0);
    group.add(shelf);
  }

  if (withBooks) {
    const bookGeo = new THREE.BoxGeometry(0.16, 0.44, 0.34);
    const total = 150;
    const instanced = new THREE.InstancedMesh(bookGeo, mat({ color: '#ffffff', roughness: 0.85 }), total);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let index = 0;
    for (let s = 0; s < shelves; s++) {
      let x = -width / 2 + 0.3;
      while (x < width / 2 - 0.3 && index < total) {
        if (random() > 0.12) {
          const h = 0.34 + random() * 0.2;
          dummy.position.set(x, (s / shelves) * height + 0.1 + h / 2, (random() - 0.5) * 0.08);
          dummy.rotation.set(0, (random() - 0.5) * 0.12, (random() - 0.5) * 0.05);
          dummy.scale.set(1, h / 0.44, 1);
          dummy.updateMatrix();
          instanced.setMatrixAt(index, dummy.matrix);
          color.set(bookColors[Math.floor(random() * bookColors.length)]);
          color.multiplyScalar(0.8 + random() * 0.4);
          instanced.setColorAt(index, color);
          index++;
        }
        x += 0.19 + random() * 0.12;
      }
    }
    instanced.count = index;
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    group.add(instanced);
  }

  markShadows(group);
  return group;
}

export function createCrate({ size = 0.9, seed = 2 } = {}) {
  const group = new THREE.Group();
  const wood = mat({ map: woodTexture(), roughness: 0.92 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), wood);
  box.position.y = size / 2;
  group.add(box);
  const frameMat = mat({ map: woodTexture('dark'), roughness: 0.95 });
  for (const y of [size * 0.18, size * 0.82]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(size * 1.02, 0.08, size * 1.02), frameMat);
    band.position.y = y;
    group.add(band);
  }
  markShadows(group);
  return group;
}

export function createBanner({ width = 1.4, height = 3.4, hue = '#7c2f2a' } = {}) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    map: bannerTexture(hue),
    roughness: 0.92,
    side: THREE.DoubleSide,
  });
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 4, 8), material);
  cloth.position.y = height / 2 - 0.4;
  // Gentle curve so it does not read as a flat card.
  const pos = cloth.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setZ(i, Math.sin((y / height) * Math.PI) * 0.09);
  }
  cloth.geometry.computeVertexNormals();
  group.add(cloth);
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, width + 0.3, 6),
    mat({ color: '#4a3a26', metalness: 0.5, roughness: 0.6 }),
  );
  rod.rotation.z = Math.PI / 2;
  rod.position.y = height / 2 - 0.4 + height / 2;
  group.add(rod);
  group.userData.sway = (t) => {
    cloth.rotation.z = Math.sin(t * 0.8) * 0.012;
  };
  return group;
}

/* ------------------------------------------------------------------ */
/* Collectibles & mechanisms                                           */
/* ------------------------------------------------------------------ */

/** Floating wind fragment / crystal collectible. */
export function createCollectible({ color = '#a8f0df', coreColor = '#e8fff8', glyph = '✦', scale = 1 } = {}) {
  const group = new THREE.Group();
  const crystalMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.1,
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.92,
  });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), crystalMat);
  crystal.scale.set(0.8, 1.35, 0.8);
  crystal.position.y = 1.05;
  group.add(crystal);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(coreColor),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.scale.set(1.5, 1.5, 1);
  halo.position.y = 1.05;
  group.add(halo);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.014, 4, 28),
    new THREE.MeshBasicMaterial({ color: coreColor, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.05;
  group.add(ring);

  const sparkle = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sparkleTexture(coreColor),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sparkle.scale.set(1.1, 1.1, 1);
  sparkle.position.y = 1.05;
  group.add(sparkle);

  const light = new THREE.PointLight(color, 2.4, 6, 2);
  light.position.y = 1.05;
  group.add(light);

  group.scale.setScalar(scale);
  group.userData.update = (dt, time) => {
    crystal.rotation.y += dt * 0.8;
    crystal.position.y = 1.05 + Math.sin(time * 1.6) * 0.12;
    halo.position.y = crystal.position.y;
    sparkle.position.y = crystal.position.y;
    ring.position.y = crystal.position.y;
    ring.rotation.z += dt * 0.5;
    light.position.y = crystal.position.y;
    light.intensity = 2.1 + Math.sin(time * 2.4) * 0.5;
  };
  group.userData.collect = () => {
    group.visible = false;
  };
  return group;
}

/** Wind mechanism used by the ruin puzzle. */
export function createMechanism({ color = '#9fe3d3', seed = 1 } = {}) {
  const group = new THREE.Group();
  const stone = mat({ map: stoneTexture(), roughness: 0.95 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 0.36, 8), stone);
  base.position.y = 0.18;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.9, 8), stone);
  column.position.y = 0.8;
  const ringMat = new THREE.MeshStandardMaterial({
    color: '#6f7d72',
    metalness: 0.65,
    roughness: 0.4,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 6, 20), ringMat);
  ring.position.y = 1.3;
  ring.rotation.x = Math.PI / 2;
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.18, 0),
    new THREE.MeshStandardMaterial({
      color: '#3f4a44',
      emissive: new THREE.Color(color),
      emissiveIntensity: 0,
      roughness: 0.3,
    }),
  );
  core.position.y = 1.3;
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(color),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.scale.set(2.2, 2.2, 1);
  halo.position.y = 1.3;
  group.add(base, column, ring, core, halo);
  markShadows(group);

  let lit = 0;
  let target = 0;
  group.userData.setLit = (value) => {
    target = value ? 1 : 0;
    lit = target;
  };
  group.userData.pulse = () => {
    group.userData.flash = 1;
  };
  group.userData.isLit = () => target > 0.5;
  group.userData.update = (dt, time) => {
    const desired = target;
    lit += (desired - lit) * Math.min(1, dt * 4);
    ringMat.emissiveIntensity = lit * 2.4;
    core.material.emissiveIntensity = lit * 3.2;
    halo.material.opacity = lit * 0.65;
    ring.rotation.z += dt * (0.3 + lit * 1.2);
    core.rotation.y += dt * (0.4 + lit * 1.6);
    core.position.y = 1.3 + (lit ? Math.sin(time * 2 + seed) * 0.04 : 0);
    if (group.userData.flash > 0) {
      group.userData.flash -= dt;
      halo.scale.setScalar(2.2 + Math.sin(time * 18) * 0.2 + group.userData.flash * 0.8);
    }
  };
  return group;
}

/** Glowing rune circle on the ground (puzzle trigger / teleport pad). */
export function createRuneCircle({ color = '#a9e8d8', radius = 2.2, opacity = 0.75 } = {}) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    map: runeRingTexture(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), material);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.06;
  group.add(disc);
  group.userData.update = (dt) => {
    disc.rotation.z += dt * 0.12;
  };
  return group;
}

/** Waystone / travel gate. */
export function createWaystone({ color = '#9fd7cf', height = 2.6, label = '' } = {}) {
  const group = new THREE.Group();
  const stone = mat({ map: stoneTexture('dark'), roughness: 0.95 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.4, 8), stone);
  plinth.position.y = 0.2;
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.4, height, 6), stone);
  spire.position.y = height / 2 + 0.3;
  group.add(plinth, spire);

  const rune = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: runeRingTexture(color),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  rune.position.y = height + 0.4;
  rune.scale.set(2.4, 2.4, 1);
  group.add(rune);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(color), transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.position.y = height + 0.4;
  glow.scale.set(3.4, 3.4, 1);
  group.add(glow);

  const light = new THREE.PointLight(color, 4, 10, 2);
  light.position.y = height + 0.3;
  group.add(light);

  markShadows(group);
  group.userData.setActive = (active) => {
    rune.material.opacity = active ? 0.9 : 0.18;
    glow.material.opacity = active ? 0.7 : 0.06;
    light.intensity = active ? 4 : 0;
    group.userData.active = active;
  };
  group.userData.setActive(true);
  group.userData.update = (dt, time) => {
    rune.rotation.z += dt * 0.4;
    rune.position.y = height + 0.4 + Math.sin(time * 1.2) * 0.1;
    glow.position.y = rune.position.y;
    if (group.userData.active) light.intensity = 3.6 + Math.sin(time * 3.1) * 0.7;
  };
  group.userData.label = label;
  return group;
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

/** Floating motes / fireflies / snow / petals. */
export function createParticleField({
  count = 220,
  area = 40,
  height = 8,
  center = [0, 0, 0],
  color = '#ffe9b0',
  size = 1.4,
  speed = 0.35,
  drift = 0.6,
  opacity = 0.8,
  texture = null,
  swirl = 0.4,
} = {}) {
  const geometry = new THREE.BufferGeometry();
  const random = rng(count * 13 + 7);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = center[0] + (random() - 0.5) * area;
    positions[i * 3 + 1] = (random() - 0.3) * height;
    positions[i * 3 + 2] = center[2] + (random() - 0.5) * area;
    seeds[i] = random();
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uSpeed: { value: speed },
      uHeight: { value: height },
      uOpacity: { value: opacity },
      uDrift: { value: drift },
      uSwirl: { value: swirl },
      uTexture: { value: texture || glowTexture(color) },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSize;
      uniform float uSpeed;
      uniform float uHeight;
      uniform float uDrift;
      uniform float uSwirl;
      uniform float uPixelRatio;
      attribute float aSeed;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float t = uTime * uSpeed * (0.5 + aSeed);
        p.y = mod(position.y + t * (1.2 + aSeed), uHeight) - 0.4;
        p.x += sin(uTime * 0.6 + aSeed * 31.0) * uDrift + sin(uTime * 0.23 + aSeed * 7.0) * uSwirl;
        p.z += cos(uTime * 0.52 + aSeed * 27.0) * uDrift * 0.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = uSize * uPixelRatio * (26.0 / max(dist, 1.0));
        vAlpha = smoothstep(0.0, 1.5, p.y) * (1.0 - smoothstep(uHeight - 2.5, uHeight, p.y));
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

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.userData.update = (dt, time) => {
    material.uniforms.uTime.value = time;
  };
  return points;
}

/** Cheap footstep dust puff. */
export class FootstepDust {
  constructor(scene, color = '#d8d2bc') {
    this.scene = scene;
    this.pool = [];
    this.index = 0;
    this.texture = glowTexture(color);
    for (let i = 0; i < 10; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.texture,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          color: new THREE.Color(color),
        }),
      );
      sprite.scale.set(0.5, 0.5, 1);
      sprite.visible = false;
      scene.add(sprite);
      this.pool.push({ sprite, life: 0 });
    }
  }

  emit(position, surface = 'grass') {
    const entry = this.pool[this.index];
    this.index = (this.index + 1) % this.pool.length;
    if (!entry) return;
    entry.sprite.position.set(position.x, position.y + 0.12, position.z);
    entry.sprite.material.color.set(surface === 'stone' ? '#cfd3cf' : surface === 'wood' ? '#c8b08a' : '#d7d3b6');
    entry.life = 0.55;
    entry.sprite.visible = true;
  }

  update(dt) {
    for (const entry of this.pool) {
      if (entry.life <= 0) continue;
      entry.life -= dt;
      const t = Math.max(0, entry.life / 0.55);
      entry.sprite.material.opacity = t * 0.55;
      entry.sprite.scale.setScalar(0.4 + (1 - t) * 0.7);
      entry.sprite.position.y += dt * 0.25;
      if (entry.life <= 0) entry.sprite.visible = false;
    }
  }

  dispose() {
    for (const entry of this.pool) {
      this.scene.remove(entry.sprite);
      entry.sprite.material.dispose();
    }
    this.pool = [];
  }
}

/** Animated water plane (ponds, streams, celestial pools). */
export function createWater({ size = 24, color = '#5f97a8', depthColor = '#2e5c6e', opacity = 0.82 } = {}) {
  const geometry = new THREE.PlaneGeometry(size, size, 24, 24);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uDeep: { value: new THREE.Color(depthColor) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 p = position;
        float wave = sin(p.x * 0.55 + uTime * 0.9) * 0.045 + sin(p.z * 0.72 - uTime * 1.2) * 0.035;
        p.y += wave;
        vWave = wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uDeep;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        float ripple = sin((vUv.x + vUv.y) * 42.0 + uTime * 1.7) * 0.5 + 0.5;
        vec3 color = mix(uDeep, uColor, 0.45 + vWave * 3.2 + ripple * 0.12);
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
        gl_FragColor = vec4(color, uOpacity * (0.55 + edge * 0.45));
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.update = (dt, time) => {
    material.uniforms.uTime.value = time;
  };
  return mesh;
}

/** Points of light arranged as a constellation, linked by glowing lines. */
export function createConstellation({ points = [], color = '#f6e6b4', lineColor = '#bcd8ff', pointSize = 2.2 } = {}) {
  const group = new THREE.Group();
  const positions = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({
    color,
    size: pointSize,
    map: sparkleTexture(color),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const stars = new THREE.Points(geo, starMat);
  group.add(stars);

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push(new THREE.Vector3(...points[i]), new THREE.Vector3(...points[i + 1]));
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints(segments);
  const lineMat = new THREE.LineBasicMaterial({
    color: lineColor,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.LineSegments(lineGeo, lineMat);
  group.add(line);
  group.userData.points = points;
  group.userData.starMat = starMat;
  group.userData.lineMat = lineMat;
  group.userData.setOpacity = (value) => {
    starMat.opacity = value;
    lineMat.opacity = value * 0.7;
  };
  return group;
}

/** A soft light shaft sprite used for god-rays and the final book glow. */
export function createLightShaft({ color = '#ffe9b8', height = 12, width = 3, opacity = 0.25 } = {}) {
  const material = new THREE.SpriteMaterial({
    map: glowTexture(color),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, height, 1);
  return sprite;
}

/** Decorative floating island (celestial ending area). */
export function createFloatingIsland({ radius = 3.4, depth = 3.2, seed = 1, topColor = '#7eae72', rockColor = '#8a8478' } = {}) {
  const random = rng(seed);
  const group = new THREE.Group();
  const geo = new THREE.ConeGeometry(radius, depth, 9, 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const noise = 0.82 + random() * 0.3;
    pos.setXYZ(i, x * noise, y - depth / 2, z * noise);
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, mat({ color: rockColor, roughness: 1, flatShading: true }));
  rock.rotation.x = Math.PI;
  rock.position.y = -depth / 2;
  group.add(rock);

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.99, radius * 0.82, 0.6, 9),
    mat({ color: topColor, roughness: 0.95, flatShading: true }),
  );
  top.position.y = 0.2;
  group.add(top);
  markShadows(group);
  return group;
}

/** Glowing flower cluster for the sanctuary. */
export function createGlowFlowers({ count = 7, radius = 1.6, color = '#bbe7ff', seed = 2 } = {}) {
  const random = rng(seed);
  const group = new THREE.Group();
  const stemMat = mat({ color: '#4c7a63', roughness: 0.9 });
  const petalMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.7,
    roughness: 0.4,
  });
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const dist = random() * radius;
    const h = 0.35 + random() * 0.5;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, h, 4), stemMat);
    stem.position.set(x, h / 2, z);
    group.add(stem);
    const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + random() * 0.04, 0), petalMat);
    bloom.position.set(x, h + 0.05, z);
    group.add(bloom);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(color), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glow.position.set(x, h + 0.05, z);
    glow.scale.setScalar(0.9);
    group.add(glow);
  }
  return group;
}

/* ------------------------------------------------------------------ */
/* UI-ish textures exposed for the book                                */
/* ------------------------------------------------------------------ */

export const bookTextures = {
  leather: bookLeatherTexture,
  parchment: parchmentTexture,
  pages: pageEdgeTexture,
};

export const sharedShadowTexture = blobShadowTexture;
