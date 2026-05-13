import * as THREE from 'three';
import {
  CharacterState,
  TILE_SIZE,
  TileType,
  type EngineCharacter,
  type FurnitureInstance,
  type OfficeLayout,
  type TaskPulse,
} from '../engine/types';
import { spriteFrameIndex } from '../engine/sprites';
import type { Camera as EngineCamera } from '../engine/camera';
import {
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_FRAMES_PER_DIR,
  buildCharacterTextureSheet,
  pixelTextureFromImage,
  type ThreeSpriteManager,
} from './textures';

/** Scene depth ordering (renderOrder). Larger renders later (on top). */
const ORDER_FLOOR = 0;
const ORDER_SHADOW = 1;
const ORDER_WALL = 100;
/** ORDER_SPRITE_BASE + y_pixel == final z order for furniture+characters. */
const ORDER_SPRITE_BASE = 1000;
const ORDER_PARTICLE = 99000;
const ORDER_OVERLAY = 100000;

const SMOKE_PARTICLE_COUNT = 24;
const DUST_PARTICLE_COUNT = 40;

const SHADOW_TEXTURE = makeShadowTexture();
const SMOKE_TEXTURE = makeSmokeTexture();
const HOVER_RING_TEXTURE = makeHoverRingTexture();

/** Optionally tinted RGB hover ring, generated once. */
function makeHoverRingTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const sz = 32;
  const c = document.createElement('canvas');
  c.width = sz;
  c.height = sz;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, sz, sz);
  const cx = sz / 2;
  const cy = sz / 2;
  // Radial soft ring
  const g = ctx.createRadialGradient(cx, cy, sz * 0.25, cx, cy, sz * 0.48);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.92, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, sz * 0.46, sz * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeShadowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const sz = 32;
  const c = document.createElement('canvas');
  c.width = sz;
  c.height = sz;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, sz, sz);
  const g = ctx.createRadialGradient(sz / 2, sz / 2, 1, sz / 2, sz / 2, sz / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sz / 2, sz / 2, sz / 2 - 1, sz / 4, 0, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeSmokeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const sz = 16;
  const c = document.createElement('canvas');
  c.width = sz;
  c.height = sz;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(sz / 2, sz / 2, 1, sz / 2, sz / 2, sz / 2);
  g.addColorStop(0, 'rgba(232,232,232,0.85)');
  g.addColorStop(0.55, 'rgba(212,212,216,0.45)');
  g.addColorStop(1, 'rgba(196,196,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sz, sz);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Resolve which furniture texture to use for a given instance + variant. */
function pickFurnitureTexture(
  f: FurnitureInstance,
  sprites: ThreeSpriteManager,
  animatedFrame = 0,
): { texture: THREE.Texture | null; flipX: boolean } {
  const fur = sprites.furniture;
  switch (f.kind) {
    case 'desk':
      return { texture: f.variant === 'side' ? fur.deskSide : fur.deskFront, flipX: false };
    case 'pc': {
      const flipX = f.variant === 'side-mirror';
      const animatedFront = f.animated ? (fur.pcFrontOn[animatedFrame % fur.pcFrontOn.length] ?? fur.pcFront) : fur.pcFront;
      const t = f.variant === 'back' ? fur.pcBack : f.variant === 'side' || flipX ? fur.pcSide : animatedFront;
      return { texture: t, flipX };
    }
    case 'chair': {
      const flipX = f.variant === 'side-mirror';
      const t = f.variant === 'back' ? fur.chairBack : f.variant === 'side' || flipX ? fur.chairSide : fur.chairFront;
      return { texture: t, flipX };
    }
    case 'table':
      return { texture: fur.tableFront, flipX: false };
    case 'whiteboard':
      return { texture: fur.whiteboard, flipX: false };
    case 'bookshelf':
      return { texture: fur.bookshelf, flipX: false };
    case 'double_bookshelf':
      return { texture: fur.doubleBookshelf, flipX: false };
    case 'plant':
      return { texture: fur.plant, flipX: false };
    case 'large_plant':
      return { texture: fur.largePlant, flipX: false };
    case 'hanging_plant':
      return { texture: fur.hangingPlant, flipX: false };
    case 'cactus':
      return { texture: fur.cactus, flipX: false };
    case 'sofa': {
      const flipX = f.variant === 'side-mirror';
      const t = f.variant === 'back' ? fur.sofaBack : f.variant === 'side' || flipX ? fur.sofaSide : fur.sofaFront;
      return { texture: t, flipX };
    }
    case 'coffee_table':
      return { texture: fur.coffeeTable, flipX: false };
    case 'coffee':
      return { texture: fur.coffee, flipX: false };
    case 'bin':
      return { texture: fur.bin, flipX: false };
    case 'cushioned_bench':
      return { texture: fur.cushionedBench, flipX: false };
    case 'small_table':
      return { texture: f.variant === 'side' ? fur.smallTableSide : fur.smallTableFront, flipX: false };
    case 'clock':
      return { texture: fur.clock, flipX: false };
    case 'small_painting':
      return { texture: fur.smallPainting, flipX: false };
    case 'large_painting':
      return { texture: fur.largePainting, flipX: false };
    default:
      return { texture: null, flipX: false };
  }
}

function texturePixelSize(texture: THREE.Texture | null): { w: number; h: number } | null {
  const image = texture?.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined;
  const w = image?.naturalWidth ?? image?.width ?? 0;
  const h = image?.naturalHeight ?? image?.height ?? 0;
  return w > 0 && h > 0 ? { w, h } : null;
}

interface FurnitureRecord {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  furniture: FurnitureInstance;
  zY: number;
  lastAnimatedFrame: number;
}

interface CharacterRecord {
  /** Body sprite plane (texture swapped each frame from sheet[dir][frame]). */
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  /** Shadow blob plane. */
  shadow: THREE.Mesh;
  shadowMaterial: THREE.MeshBasicMaterial;
  /** Hover ring (created lazily and hidden by default). */
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  /** Tint overlay for blocked flash. */
  tint: THREE.Mesh;
  tintMaterial: THREE.MeshBasicMaterial;
  /** Sheet textures for this character's palette: [dir][frame]. */
  sheet: THREE.Texture[][] | null;
  /** Last applied palette index for cheap re-key on rebuild. */
  palette: number;
  /** Last applied dir/frame to skip texture reassignment. */
  lastDir: number;
  lastFrameIdx: number;
}

interface ParticlePos {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface PulseRecord {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  pulse: TaskPulse;
}

export interface ThreeWorkshopRendererOptions {
  canvas: HTMLCanvasElement;
  sprites: ThreeSpriteManager;
  /** World map size in pixels (cols*TILE, rows*TILE). */
  mapPixelW: number;
  mapPixelH: number;
  /** Logical (CSS) size of the canvas. */
  cssW: number;
  cssH: number;
  /** Device pixel ratio. */
  dpr: number;
}

export interface RenderTick {
  layout: OfficeLayout | null;
  characters: EngineCharacter[];
  darkMode: boolean;
  camera: EngineCamera;
  hoveredRole: string | null;
  taskPulses: TaskPulse[];
  nowMs: number;
}

/**
 * Three.js powered Workshop renderer.
 *
 * World coordinate mapping: world pixel X → scene X, world pixel Y → scene -Y
 * (because in canvas-space Y goes down but we render with the camera looking
 * straight down the -Z axis, so we invert Y for natural mapping). The camera
 * still uses world-pixel units; this keeps all engine math (pathfinding,
 * character.ts, office-layout.ts) untouched.
 */
export class ThreeWorkshopRenderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;

  private sprites: ThreeSpriteManager;
  private mapPixelW: number;
  private mapPixelH: number;
  private cssW: number;
  private cssH: number;
  private dpr: number;

  /** Static map meshes (floor + walls) rebuilt on layout change. */
  private mapGroup: THREE.Group;
  private currentLayoutId: string | null = null;

  /** Furniture meshes keyed by furniture id; rebuilt on layout change. */
  private furniture = new Map<string, FurnitureRecord>();

  /** Character records keyed by role. */
  private characters = new Map<string, CharacterRecord>();

  /** Smoke particles (cigarette wisps) + ambient dust motes. */
  private smokeParticles: ParticlePos[] = [];
  private dustParticles: ParticlePos[] = [];
  private smokeGroup: THREE.Group;
  private dustGroup: THREE.Group;
  private smokeOrigins: Array<{ x: number; y: number }> = [];

  /** Task pulse meshes. */
  private pulseGroup: THREE.Group;
  private pulses: PulseRecord[] = [];

  /** Vignette / lighting overlay quad (rendered in screen space). */
  private vignetteScene: THREE.Scene;
  private vignetteCamera: THREE.OrthographicCamera;
  private vignetteMesh: THREE.Mesh;
  private vignetteMaterial: THREE.ShaderMaterial;

  /** Raycaster for hover detection. */
  private raycaster: THREE.Raycaster;
  private ndc: THREE.Vector2;

  constructor(opts: ThreeWorkshopRendererOptions) {
    this.sprites = opts.sprites;
    this.mapPixelW = opts.mapPixelW;
    this.mapPixelH = opts.mapPixelH;
    this.cssW = opts.cssW;
    this.cssH = opts.cssH;
    this.dpr = opts.dpr;

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.OrthographicCamera(
      -opts.cssW / 2,
      opts.cssW / 2,
      opts.cssH / 2,
      -opts.cssH / 2,
      -10000,
      10000,
    );
    this.camera.position.set(opts.mapPixelW / 2, -opts.mapPixelH / 2, 100);
    this.camera.lookAt(opts.mapPixelW / 2, -opts.mapPixelH / 2, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
    });
    this.renderer.setPixelRatio(opts.dpr);
    this.renderer.setSize(opts.cssW, opts.cssH, false);
    this.renderer.setClearColor(0x06090a, 1);
    this.renderer.autoClear = true;

    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);

    this.smokeGroup = new THREE.Group();
    this.smokeGroup.renderOrder = ORDER_PARTICLE;
    this.scene.add(this.smokeGroup);

    this.dustGroup = new THREE.Group();
    this.dustGroup.renderOrder = ORDER_PARTICLE - 1;
    this.scene.add(this.dustGroup);

    this.pulseGroup = new THREE.Group();
    this.pulseGroup.renderOrder = ORDER_OVERLAY - 1;
    this.scene.add(this.pulseGroup);

    // Vignette overlay: a fullscreen quad with a fragment shader that paints
    // a warm fluorescent-cast radial vignette + faint horizontal scanlines.
    // Rendered as a separate pass *after* the main scene so it tints the
    // composited image, mimicking the look of 90s office fluorescent light.
    this.vignetteScene = new THREE.Scene();
    this.vignetteCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const vignetteGeom = new THREE.PlaneGeometry(2, 2);
    this.vignetteMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uDark: { value: 0 },
        uTime: { value: 0 },
        uIntensity: { value: 0.5 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uDark;
        uniform float uTime;
        uniform float uIntensity;
        void main() {
          // Vignette
          vec2 c = vUv - 0.5;
          float r = dot(c, c);
          float v = smoothstep(0.18, 0.65, r);
          // Warm fluorescent tint (slightly green/yellow in light, blue in dark)
          vec3 tintLight = vec3(0.96, 0.92, 0.78);
          vec3 tintDark = vec3(0.42, 0.46, 0.52);
          vec3 tint = mix(tintLight, tintDark, uDark);
          // Scanlines
          float sl = sin(vUv.y * 800.0) * 0.5 + 0.5;
          sl = mix(1.0, 1.0 - 0.06, step(0.5, sl));
          // Final: dark edge tint + scanlines
          vec3 color = vec3(0.0);
          color = mix(color, tint, v * uIntensity);
          float a = v * uIntensity * 0.55 + (1.0 - sl) * 0.15;
          gl_FragColor = vec4(color, a);
        }
      `,
    });
    this.vignetteMesh = new THREE.Mesh(vignetteGeom, this.vignetteMaterial);
    this.vignetteScene.add(this.vignetteMesh);

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();

    this.initParticles();
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = Math.max(1, dpr);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.cssW, this.cssH, false);
    this.camera.left = -this.cssW / 2;
    this.camera.right = this.cssW / 2;
    this.camera.top = this.cssH / 2;
    this.camera.bottom = -this.cssH / 2;
    this.camera.updateProjectionMatrix();
  }

  /** Apply an engine camera (world-pixel rect + scale) to the Three camera. */
  applyEngineCamera(cam: EngineCamera): void {
    // Engine camera produces a view rect in world pixels + uniform scale
    // for world→CSS px. We replicate this with the orthographic camera.
    // Center the camera on the view center; zoom so 1 world px = `scale` CSS px.
    const cx = cam.x + cam.width / 2;
    const cy = -(cam.y + cam.height / 2); // invert Y for Three
    this.camera.position.set(cx, cy, 100);
    this.camera.lookAt(cx, cy, 0);
    // Zoom adjusts the orthographic view scale. With width=cssW/scale, we want
    // the camera frustum half-width = cssW / (2*scale), so zoom = scale.
    this.camera.zoom = Math.max(0.01, cam.scale);
    this.camera.updateProjectionMatrix();
  }

  /** (Re)build static map meshes (floor + walls) and furniture from layout. */
  syncLayout(layout: OfficeLayout | null): void {
    const newId = layout ? `${layout.cols}x${layout.rows}-${layout.furniture.length}` : null;
    if (newId === this.currentLayoutId) return;
    this.currentLayoutId = newId;
    this.clearMapGroup();
    this.clearFurniture();
    if (!layout) return;

    this.buildFloorMesh(layout);
    this.buildWallMesh(layout);
    this.buildFurnitureMeshes(layout);
    this.computeSmokeOrigins(layout);
  }

  /** Sync engine characters → Three.js sprite meshes; create/destroy as needed. */
  syncCharacters(chars: EngineCharacter[]): void {
    const seen = new Set<string>();
    for (const c of chars) {
      seen.add(c.role);
      let rec = this.characters.get(c.role);
      if (!rec) {
        rec = this.createCharacterRecord(c);
        this.characters.set(c.role, rec);
      } else if (rec.palette !== c.palette) {
        // Palette changed: rebuild texture sheet.
        rec.palette = c.palette;
        const src = this.sprites.characterSheetSrc[c.palette] ?? null;
        rec.sheet = buildCharacterTextureSheet(src);
        rec.lastDir = -1;
        rec.lastFrameIdx = -1;
      }
    }
    for (const [role, rec] of this.characters) {
      if (seen.has(role)) continue;
      this.removeCharacterRecord(rec);
      this.characters.delete(role);
    }
  }

  /** Per-frame update: character positions, animation frames, particles, pulses. */
  update(tick: RenderTick, dt: number): void {
    const { characters, hoveredRole, taskPulses, nowMs, darkMode } = tick;

    // Characters
    for (const c of characters) {
      const rec = this.characters.get(c.role);
      if (!rec) continue;
      // Position: top-left in world px → center in scene coords.
      const sx = c.x + CHAR_FRAME_W / 2;
      const sy = -(c.y + CHAR_FRAME_H / 2);
      rec.mesh.position.set(sx, sy, 0);
      // Z-order by foot Y.
      const footY = c.y + CHAR_FRAME_H;
      rec.mesh.renderOrder = ORDER_SPRITE_BASE + footY;
      // Shadow
      const shadowX = c.x + CHAR_FRAME_W / 2;
      const shadowY = -(c.y + CHAR_FRAME_H - 2);
      rec.shadow.position.set(shadowX, shadowY, 0);
      rec.shadow.renderOrder = ORDER_SHADOW + footY * 0.001;
      // Hover ring
      rec.ring.position.set(shadowX, shadowY - 1, 0);
      rec.ring.renderOrder = ORDER_SPRITE_BASE + footY - 0.5;
      const wantHover = hoveredRole === c.role;
      rec.ringMaterial.opacity = wantHover ? 0.85 : 0;
      rec.ringMaterial.color.set(c.profile.color);
      rec.ring.visible = wantHover;
      // Frame texture
      const state: 'idle' | 'walk' | 'type' | 'read' =
        c.state === CharacterState.WALK
          ? 'walk'
          : c.state === CharacterState.TYPE
            ? 'type'
            : c.state === CharacterState.READ
              ? 'read'
              : 'idle';
      const frameIdx = spriteFrameIndex(state, c.frame);
      const dir = c.dir | 0;
      if (rec.sheet && (dir !== rec.lastDir || frameIdx !== rec.lastFrameIdx)) {
        const frameTex = rec.sheet[dir]?.[Math.min(frameIdx, CHAR_FRAMES_PER_DIR - 1)] ?? rec.sheet[dir]?.[0] ?? null;
        if (frameTex) {
          rec.material.map = frameTex;
          rec.material.needsUpdate = true;
        }
        rec.lastDir = dir;
        rec.lastFrameIdx = frameIdx;
      }
      // Blocked flash tint
      rec.tint.position.set(sx, sy, 0);
      rec.tint.renderOrder = rec.mesh.renderOrder + 0.5;
      const flashOn = c.isBlocked && c.flashTimer < 0.5;
      rec.tintMaterial.opacity = flashOn ? 0.45 : 0;
      rec.tint.visible = flashOn;
    }

    this.updateFurnitureAnimations(nowMs);

    // Smoke wisps — emit & advect.
    this.updateSmoke(dt);
    this.updateDust(dt);

    // Task pulses
    this.syncPulses(taskPulses, characters, nowMs);

    // Vignette uniforms + clear color
    this.vignetteMaterial.uniforms.uDark.value = darkMode ? 1.0 : 0.0;
    this.vignetteMaterial.uniforms.uTime.value = (nowMs % 100000) / 1000;
    this.setDarkMode(darkMode);
  }

  /** Render the scene + vignette pass. */
  render(): void {
    // Main pass
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    // Vignette overlay
    this.renderer.autoClear = false;
    this.renderer.render(this.vignetteScene, this.vignetteCamera);
  }

  /** Raycast at CSS-pixel coords; returns role of hit character or null. */
  pickCharacter(cssX: number, cssY: number): string | null {
    if (this.characters.size === 0) return null;
    this.ndc.x = (cssX / this.cssW) * 2 - 1;
    this.ndc.y = -((cssY / this.cssH) * 2 - 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    let best: { role: string; renderOrder: number } | null = null;
    for (const [role, rec] of this.characters) {
      const hits = this.raycaster.intersectObject(rec.mesh, false);
      if (hits.length > 0) {
        if (!best || rec.mesh.renderOrder > best.renderOrder) {
          best = { role, renderOrder: rec.mesh.renderOrder };
        }
      }
    }
    return best?.role ?? null;
  }

  dispose(): void {
    this.clearMapGroup();
    this.clearFurniture();
    for (const rec of this.characters.values()) {
      this.removeCharacterRecord(rec);
    }
    this.characters.clear();
    for (const pr of this.pulses) {
      this.pulseGroup.remove(pr.mesh);
      pr.material.dispose();
      pr.mesh.geometry.dispose();
    }
    this.pulses = [];
    this.smokeGroup.clear();
    this.dustGroup.clear();
    this.vignetteMaterial.dispose();
    this.renderer.dispose();
  }

  /** Update the clear color in response to theme changes. */
  setDarkMode(dark: boolean): void {
    this.renderer.setClearColor(dark ? 0x06090a : 0x1c1a14, 1);
  }

  // ── Layout meshes ──────────────────────────────────────────────────────────

  private buildFloorMesh(layout: OfficeLayout): void {
    // Build a single CanvasTexture covering the entire map's floor by drawing
    // each tile's variant. Then a single plane uses it. This avoids tens of
    // thousands of draw calls for tiles.
    const w = layout.cols * TILE_SIZE;
    const h = layout.rows * TILE_SIZE;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1c1a14';
    ctx.fillRect(0, 0, w, h);
    const floors = this.sprites.floor;
    const fallback = floors[0] ?? null;
    for (let r = 0; r < layout.rows; r++) {
      for (let cc = 0; cc < layout.cols; cc++) {
        const tile = layout.tiles[r][cc];
        if (tile !== TileType.FLOOR) continue;
        const variantIdx = layout.floorVariants[r]?.[cc] ?? 0;
        const img = floors[variantIdx] ?? fallback;
        if (img) {
          ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE, cc * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = '#e2dcc7';
          ctx.fillRect(cc * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    const geom = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
    const mesh = new THREE.Mesh(geom, mat);
    // Center the plane at map center (in world coords with Y inverted).
    mesh.position.set(w / 2, -h / 2, 0);
    mesh.renderOrder = ORDER_FLOOR;
    this.mapGroup.add(mesh);
  }

  private buildWallMesh(layout: OfficeLayout): void {
    const w = layout.cols * TILE_SIZE;
    const h = layout.rows * TILE_SIZE;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    const wall = this.sprites.wall;
    for (let r = 0; r < layout.rows; r++) {
      for (let cc = 0; cc < layout.cols; cc++) {
        const tile = layout.tiles[r][cc];
        if (tile !== TileType.WALL) continue;
        if (wall) {
          ctx.drawImage(wall, 0, 0, TILE_SIZE, TILE_SIZE, cc * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = '#bdb59a';
          ctx.fillRect(cc * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    const geom = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(w / 2, -h / 2, 0);
    mesh.renderOrder = ORDER_WALL;
    this.mapGroup.add(mesh);
  }

  private buildFurnitureMeshes(layout: OfficeLayout): void {
    for (const f of layout.furniture) {
      const rec = this.createFurnitureRecord(f);
      if (rec) this.furniture.set(f.id, rec);
    }
  }

  private createFurnitureRecord(f: FurnitureInstance): FurnitureRecord | null {
    const { texture, flipX } = pickFurnitureTexture(f, this.sprites);
    const overhang = f.spriteOverhangRows ?? 0;
    const footprintW = f.w * TILE_SIZE;
    const footprintH = f.h * TILE_SIZE;
    const natural = texturePixelSize(texture);
    const dw = natural?.w ?? footprintW;
    const dh = natural?.h ?? footprintH + overhang * TILE_SIZE;
    const dx = f.col * TILE_SIZE + (footprintW - dw) / 2;
    const bottomY = (f.row + f.h) * TILE_SIZE;
    const dy = natural ? bottomY - dh : (f.row - overhang) * TILE_SIZE;
    const geom = new THREE.PlaneGeometry(dw, dh);
    if (flipX) {
      // Flip texture horizontally via UVs
      const uv = geom.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setX(i, 1 - uv.getX(i));
      }
      uv.needsUpdate = true;
    }
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: false,
    });
    if (!texture) {
      mat.color.set(f.kind === 'desk' || f.kind === 'table' ? '#8a5a2b' : '#444');
      mat.transparent = false;
    }
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(dx + dw / 2, -(dy + dh / 2), 0);
    const zY = (f.row + f.h) * TILE_SIZE;
    mesh.renderOrder = ORDER_SPRITE_BASE + zY;
    this.scene.add(mesh);
    return { mesh, material: mat, furniture: f, zY, lastAnimatedFrame: -1 };
  }

  private updateFurnitureAnimations(nowMs: number): void {
    for (const rec of this.furniture.values()) {
      const f = rec.furniture;
      if (f.kind !== 'pc' || !f.animated || f.variant !== 'front') continue;
      const frames = this.sprites.furniture.pcFrontOn;
      if (frames.length === 0) continue;
      const frame = Math.floor(nowMs / 280) % frames.length;
      if (frame === rec.lastAnimatedFrame) continue;
      const texture = frames[frame] ?? this.sprites.furniture.pcFront;
      if (!texture || rec.material.map === texture) continue;
      rec.material.map = texture;
      rec.material.needsUpdate = true;
      rec.lastAnimatedFrame = frame;
    }
  }

  // ── Character meshes ───────────────────────────────────────────────────────

  private createCharacterRecord(c: EngineCharacter): CharacterRecord {
    const src = this.sprites.characterSheetSrc[c.palette] ?? null;
    const sheet = buildCharacterTextureSheet(src);

    const mat = new THREE.MeshBasicMaterial({
      map: sheet?.[0]?.[0] ?? null,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: false,
    });
    if (!sheet) {
      mat.color.set(c.profile.color);
      mat.transparent = false;
    }
    const geom = new THREE.PlaneGeometry(CHAR_FRAME_W, CHAR_FRAME_H);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(c.x + CHAR_FRAME_W / 2, -(c.y + CHAR_FRAME_H / 2), 0);
    this.scene.add(mesh);

    // Shadow
    const shadowGeom = new THREE.PlaneGeometry(CHAR_FRAME_W + 2, CHAR_FRAME_W * 0.5);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: SHADOW_TEXTURE,
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    });
    const shadow = new THREE.Mesh(shadowGeom, shadowMat);
    shadow.position.set(c.x + CHAR_FRAME_W / 2, -(c.y + CHAR_FRAME_H - 2), 0);
    shadow.renderOrder = ORDER_SHADOW;
    this.scene.add(shadow);

    // Hover ring (under feet)
    const ringGeom = new THREE.PlaneGeometry(CHAR_FRAME_W + 4, CHAR_FRAME_W * 0.55);
    const ringMat = new THREE.MeshBasicMaterial({
      map: HOVER_RING_TEXTURE,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      color: new THREE.Color(c.profile.color),
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.visible = false;
    this.scene.add(ring);

    // Blocked flash tint overlay (red, additive on sprite area)
    const tintGeom = new THREE.PlaneGeometry(CHAR_FRAME_W, CHAR_FRAME_H);
    const tintMat = new THREE.MeshBasicMaterial({
      color: 0xdc2626,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const tint = new THREE.Mesh(tintGeom, tintMat);
    tint.visible = false;
    this.scene.add(tint);

    return {
      mesh,
      material: mat,
      shadow,
      shadowMaterial: shadowMat,
      ring,
      ringMaterial: ringMat,
      tint,
      tintMaterial: tintMat,
      sheet,
      palette: c.palette,
      lastDir: -1,
      lastFrameIdx: -1,
    };
  }

  private removeCharacterRecord(rec: CharacterRecord): void {
    this.scene.remove(rec.mesh);
    this.scene.remove(rec.shadow);
    this.scene.remove(rec.ring);
    this.scene.remove(rec.tint);
    rec.mesh.geometry.dispose();
    rec.material.dispose();
    rec.shadow.geometry.dispose();
    rec.shadowMaterial.dispose();
    rec.ring.geometry.dispose();
    rec.ringMaterial.dispose();
    rec.tint.geometry.dispose();
    rec.tintMaterial.dispose();
    if (rec.sheet) {
      for (const row of rec.sheet) {
        for (const t of row) t.dispose();
      }
    }
  }

  // ── Particles ──────────────────────────────────────────────────────────────

  private initParticles(): void {
    // Smoke wisps — emitted from designated origins; per-instance plane mesh.
    for (let i = 0; i < SMOKE_PARTICLE_COUNT; i++) {
      const geom = new THREE.PlaneGeometry(8, 8);
      const mat = new THREE.MeshBasicMaterial({
        map: SMOKE_TEXTURE,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      this.smokeGroup.add(mesh);
      this.smokeParticles.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0,
        life: 0, maxLife: 0,
        size: 0,
      });
    }
    // Dust motes — drifting across the entire map.
    for (let i = 0; i < DUST_PARTICLE_COUNT; i++) {
      const geom = new THREE.PlaneGeometry(2, 2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfffadc,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      this.dustGroup.add(mesh);
      this.dustParticles.push({
        x: Math.random() * this.mapPixelW,
        y: Math.random() * this.mapPixelH,
        z: 0,
        vx: (Math.random() - 0.5) * 3,
        vy: -2 - Math.random() * 4,
        life: Math.random() * 8,
        maxLife: 8 + Math.random() * 4,
        size: 1 + Math.random(),
      });
    }
  }

  private computeSmokeOrigins(layout: OfficeLayout): void {
    // Use the office's bin / coffee instances as smoke emitter spots
    // (re-skinned to ashtray / vending steam for the office theme).
    this.smokeOrigins = [];
    for (const f of layout.furniture) {
      if (f.kind === 'bin' || f.kind === 'coffee') {
        const x = (f.col + f.w / 2) * TILE_SIZE;
        const y = (f.row + 0.2) * TILE_SIZE;
        this.smokeOrigins.push({ x, y });
      }
    }
  }

  private updateSmoke(dt: number): void {
    const meshes = this.smokeGroup.children as THREE.Mesh[];
    for (let i = 0; i < this.smokeParticles.length; i++) {
      const p = this.smokeParticles[i];
      const m = meshes[i];
      const mat = m.material as THREE.MeshBasicMaterial;
      p.life -= dt;
      if (p.life <= 0) {
        // Respawn at a random origin
        if (this.smokeOrigins.length === 0) {
          m.visible = false;
          continue;
        }
        if (Math.random() < dt * 1.5) {
          const o = this.smokeOrigins[(Math.random() * this.smokeOrigins.length) | 0];
          p.x = o.x + (Math.random() - 0.5) * 4;
          p.y = o.y;
          p.vx = (Math.random() - 0.5) * 5;
          p.vy = -8 - Math.random() * 6;
          p.maxLife = 2 + Math.random() * 1.5;
          p.life = p.maxLife;
          p.size = 4 + Math.random() * 4;
        } else {
          m.visible = false;
          continue;
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1 - dt * 0.4);
      const t = 1 - p.life / p.maxLife;
      const scale = p.size * (0.6 + t * 1.6);
      m.scale.set(scale / 8, scale / 8, 1);
      mat.opacity = Math.max(0, Math.min(0.5, (1 - t) * 0.5));
      m.position.set(p.x, -p.y, 0);
      m.visible = mat.opacity > 0.02;
    }
  }

  private updateDust(dt: number): void {
    const meshes = this.dustGroup.children as THREE.Mesh[];
    for (let i = 0; i < this.dustParticles.length; i++) {
      const p = this.dustParticles[i];
      const m = meshes[i];
      const mat = m.material as THREE.MeshBasicMaterial;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.x = Math.random() * this.mapPixelW;
        p.y = this.mapPixelH * (0.3 + Math.random() * 0.7);
        p.vx = (Math.random() - 0.5) * 3;
        p.vy = -1 - Math.random() * 3;
        p.life = 0;
        p.maxLife = 6 + Math.random() * 4;
        p.size = 1 + Math.random();
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const t = p.life / p.maxLife;
      // Fade in then out.
      const fade = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
      mat.opacity = fade * 0.35;
      m.scale.set(p.size, p.size, 1);
      m.position.set(p.x, -p.y, 0);
      m.visible = mat.opacity > 0.02;
    }
  }

  // ── Task pulses ────────────────────────────────────────────────────────────

  private syncPulses(pulses: TaskPulse[], characters: EngineCharacter[], nowMs: number): void {
    // Add new pulse meshes for new pulse IDs; update existing; remove expired.
    const ids = new Set(pulses.map((p) => p.id));
    // Remove finished
    this.pulses = this.pulses.filter((pr) => {
      if (!ids.has(pr.pulse.id)) {
        this.pulseGroup.remove(pr.mesh);
        pr.material.dispose();
        pr.mesh.geometry.dispose();
        return false;
      }
      return true;
    });
    const existingIds = new Set(this.pulses.map((pr) => pr.pulse.id));
    for (const pulse of pulses) {
      if (existingIds.has(pulse.id)) continue;
      const geom = new THREE.PlaneGeometry(12, 12);
      const mat = new THREE.MeshBasicMaterial({
        color: pulse.kind === 'complete' ? 0x22c55e : 0xf59e0b,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(geom, mat);
      this.pulseGroup.add(mesh);
      this.pulses.push({ mesh, material: mat, pulse });
    }
    // Update positions/opacities
    for (const pr of this.pulses) {
      const to = characters.find((c) => c.role === pr.pulse.toRole);
      if (!to) {
        pr.mesh.visible = false;
        continue;
      }
      const from = pr.pulse.fromRole ? characters.find((c) => c.role === pr.pulse.fromRole) : null;
      const elapsed = nowMs - pr.pulse.startedAt;
      const t = Math.min(Math.max(elapsed / pr.pulse.durationMs, 0), 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const targetX = to.x + CHAR_FRAME_W / 2;
      const targetY = to.y + 2;
      if (pr.pulse.kind === 'complete') {
        const radius = 4 + t * 13;
        pr.mesh.scale.set(radius / 6, radius / 6, 1);
        pr.material.opacity = Math.max(0, 1 - t) * 0.85;
        pr.mesh.position.set(targetX, -(targetY + 10), 0);
      } else {
        const startX = from ? from.x + CHAR_FRAME_W / 2 : targetX - 36;
        const startY = from ? from.y + 2 : targetY - 10;
        const arc = Math.sin(Math.PI * ease) * 18;
        const x = startX + (targetX - startX) * ease;
        const y = startY + (targetY - startY) * ease - arc;
        pr.material.opacity = Math.sin(Math.PI * Math.min(t, 0.98)) * 0.9;
        pr.mesh.scale.set(1, 1, 1);
        pr.mesh.position.set(x, -y, 0);
      }
      pr.mesh.visible = pr.material.opacity > 0.02;
    }
  }

  // ── Cleanup helpers ────────────────────────────────────────────────────────

  private clearMapGroup(): void {
    while (this.mapGroup.children.length > 0) {
      const child = this.mapGroup.children[0] as THREE.Mesh;
      this.mapGroup.remove(child);
      child.geometry?.dispose();
      const mat = child.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else if (mat) {
        const mm = mat as THREE.MeshBasicMaterial;
        if (mm.map) mm.map.dispose();
        mm.dispose();
      }
    }
  }

  private clearFurniture(): void {
    for (const rec of this.furniture.values()) {
      this.scene.remove(rec.mesh);
      rec.mesh.geometry.dispose();
      rec.material.dispose();
    }
    this.furniture.clear();
  }
}
