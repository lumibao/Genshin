/**
 * Stylised NPC avatars and their floating quest markers.
 * Built from primitives so no external character models are required; see
 * ASSETS.md for the GLB replacement notes if you want to swap them later.
 */
import * as THREE from 'three';
import { glowTexture, sparkleTexture } from '../game/Textures.js';
import { rng } from './WorldKit.js';

function standard(params) {
  return new THREE.MeshStandardMaterial(params);
}

export function createNPCModel({
  robeColor = '#4f6f7a',
  trimColor = '#d9bd82',
  hairColor = '#e6ddc9',
  skinColor = '#f0cdb2',
  hood = false,
  staff = false,
  tall = 1,
  seed = 1,
} = {}) {
  const random = rng(seed);
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);

  const robeMat = standard({ color: robeColor, roughness: 0.9 });
  const trimMat = standard({ color: trimColor, metalness: 0.6, roughness: 0.4 });
  const skinMat = standard({ color: skinColor, roughness: 0.85 });
  const hairMat = standard({ color: hairColor, roughness: 0.7 });

  // Robe
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 1.18, 10), robeMat);
  robe.position.y = 0.72;
  root.add(robe);

  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 5, 14), trimMat);
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.16;
  root.add(hem);

  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.12, 10), trimMat);
  sash.position.y = 0.94;
  root.add(sash);

  // Shoulders & arms
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.2, 10), robeMat);
  shoulder.position.y = 1.28;
  root.add(shoulder);

  const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.56, 6);
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  for (const [arm, sign] of [
    [armL, -1],
    [armR, 1],
  ]) {
    arm.position.set(sign * 0.29, 1.22, 0);
    const sleeve = new THREE.Mesh(armGeo, robeMat);
    sleeve.position.y = -0.24;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 5), skinMat);
    hand.position.y = -0.52;
    arm.add(sleeve, hand);
    arm.rotation.z = sign * 0.1;
    root.add(arm);
  }

  // Head
  const head = new THREE.Group();
  head.position.y = 1.55;
  root.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), skinMat);
  skull.scale.set(1, 1.04, 0.96);
  head.add(skull);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.205, 14, 10), hairMat);
  hair.position.y = 0.03;
  hair.scale.set(1.04, 1.0, 1.02);
  head.add(hair);
  const fringe = new THREE.Mesh(
    new THREE.SphereGeometry(0.196, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.4),
    hairMat,
  );
  fringe.position.y = 0.05;
  fringe.rotation.x = -0.2;
  head.add(fringe);

  if (hood) {
    const hoodMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.68),
      standard({ color: robeColor, roughness: 0.95, side: THREE.DoubleSide }),
    );
    hoodMesh.position.y = 0.07;
    hoodMesh.rotation.x = -0.12;
    head.add(hoodMesh);
  } else {
    // Long hair at the back
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.1, 0.5, 8), hairMat);
    back.position.set(0, -0.22, -0.1);
    head.add(back);
  }

  const eyeMat = standard({ color: '#3a4a52', roughness: 0.4 });
  for (const sign of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 7, 5), eyeMat);
    eye.position.set(sign * 0.07, 0, 0.172);
    eye.scale.set(1, 1.2, 0.5);
    head.add(eye);
  }

  if (staff) {
    const staffGroup = new THREE.Group();
    staffGroup.position.set(0.11, 0, 0.12);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.032, 1.95, 6),
      standard({ color: '#7a5a38', roughness: 0.85 }),
    );
    pole.position.y = 0.98;
    staffGroup.add(pole);
    const headOrb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11, 0),
      new THREE.MeshStandardMaterial({
        color: '#cdeee6',
        emissive: '#7fd6c6',
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    );
    headOrb.position.y = 2.0;
    staffGroup.add(headOrb);
    const orbGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture('#bff2e6'), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    orbGlow.position.y = 2.0;
    orbGlow.scale.set(0.9, 0.9, 1);
    staffGroup.add(orbGlow);
    root.add(staffGroup);
    group.userData.staffOrb = headOrb;
  }

  root.scale.setScalar(tall * (0.98 + random() * 0.06));

  group.userData.update = (dt, time) => {
    const breathe = Math.sin(time * 1.4 + seed) * 0.012;
    root.position.y = breathe;
    root.rotation.z = Math.sin(time * 0.7 + seed) * 0.006;
    armL.rotation.x = Math.sin(time * 0.9 + seed) * 0.04;
    armR.rotation.x = -Math.sin(time * 0.9 + seed) * 0.04;
    head.rotation.y = Math.sin(time * 0.36 + seed * 2) * 0.14;
    head.rotation.x = Math.sin(time * 0.5 + seed) * 0.03;
    if (group.userData.staffOrb) {
      group.userData.staffOrb.rotation.y += dt * 0.8;
      group.userData.staffOrb.position.y = 2.0 + Math.sin(time * 1.7) * 0.03;
    }
  };

  group.userData.arms = { armL, armR };
  group.userData.head = head;
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = false;
    }
  });
  return group;
}

/** Floating exclamation / quest diamond above an NPC. */
export function createQuestMarker({ color = '#f7e7b8', offsetY = 2.2 } = {}) {
  const group = new THREE.Group();
  group.position.y = offsetY;

  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.13, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.3,
    }),
  );
  diamond.scale.y = 1.5;
  group.add(diamond);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sparkleTexture(color),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.scale.set(0.8, 0.8, 1);
  group.add(glow);

  group.userData.update = (dt, time) => {
    diamond.rotation.y += dt * 1.2;
    group.position.y = offsetY + Math.sin(time * 1.8) * 0.09;
    glow.material.opacity = 0.6 + Math.sin(time * 2.6) * 0.22;
  };
  group.userData.setVisible = (visible) => {
    group.visible = visible;
  };
  return group;
}
