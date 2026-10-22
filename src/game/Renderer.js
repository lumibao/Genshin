/**
 * WebGL renderer wrapper with device-aware quality and adaptive resolution.
 * Also owns the single canvas element the whole game draws into.
 */
import * as THREE from 'three';

export function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

export function isCoarsePointer() {
  try {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  } catch {
    return false;
  }
}

export class Renderer {
  constructor(container, settings) {
    this.container = container;
    this.settings = settings;
    this.isMobile = isCoarsePointer() || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    this.devicePixelRatio = window.devicePixelRatio || 1;
    this.frameCount = 0;
    this.frameTimeAccum = 0;
    this.qualityScale = 1;
    this.maxDPR = this.isMobile ? 1.75 : 2;

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: !this.isMobile,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch (err) {
      throw new Error(`WebGL initialization failed: ${err?.message || err}`);
    }

    this.renderer.setClearColor(0x0a1220, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = 'game-canvas';
    this.renderer.domElement.setAttribute('aria-label', 'Project Asteria game view');
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);

    this.canvas = this.renderer.domElement;
    this.contextLost = false;

    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      console.warn('[Renderer] WebGL context lost');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      console.info('[Renderer] WebGL context restored');
    });

    this.applyQuality();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 220));
  }

  get tier() {
    const requested = this.settings.quality;
    if (requested === 'low') return 'low';
    if (requested === 'high') return 'high';
    return this.isMobile ? 'low' : 'high';
  }

  applyQuality() {
    const tier = this.tier;
    this.renderer.shadowMap.enabled = tier === 'high';
    this.maxDPR = tier === 'high' ? (this.isMobile ? 1.75 : 2) : 1.4;
    this.qualityScale = 1;
    if (tier === 'high') {
      this.renderer.toneMappingExposure = 1.12;
    } else {
      this.renderer.toneMappingExposure = 1.2;
    }
    this.resize();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.width = width;
    this.height = height;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDPR) * this.qualityScale;
    this.renderer.setPixelRatio(Math.min(Math.max(dpr, 0.7), 2));
    this.renderer.setSize(width, height, false);
  }

  setQualityScale(scale) {
    const clamped = Math.min(1, Math.max(0.62, scale));
    if (Math.abs(clamped - this.qualityScale) < 0.02) return;
    this.qualityScale = clamped;
    this.resize();
  }

  /** Adaptive resolution: keeps frame time under control on weak GPUs. */
  trackFrame(dt) {
    if (this.settings.quality !== 'auto') return;
    this.frameCount++;
    this.frameTimeAccum += dt;
    if (this.frameCount < 90) return;
    const avg = this.frameTimeAccum / this.frameCount;
    this.frameCount = 0;
    this.frameTimeAccum = 0;
    if (avg > 0.028) this.setQualityScale(this.qualityScale - 0.08);
    else if (avg < 0.014 && this.qualityScale < 1) this.setQualityScale(this.qualityScale + 0.04);
  }

  render(scene, camera) {
    if (this.contextLost) return;
    this.renderer.render(scene, camera);
  }

  dispose() {
    try {
      this.renderer.dispose();
      this.canvas.remove();
    } catch {
      /* ignore */
    }
  }
}
