import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, NgZone, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
// Type-only import: erased at build time, so `three` is NOT pulled into this chunk eagerly —
// the runtime `await import('three')` below is what creates the lazy WebGL chunk. Used only for
// the `THREE.*` type references; runtime values come from `this.three`.
import type * as THREE from 'three';

/** One demo card, mirroring the real deck's three types (curse / powerup / time bonus). */
interface CardSpec {
  title: string;
  kind: string;
  color: string; // header + emblem tint (curse rose / powerup metro-blue / bonus metro-green)
  accent: string;
  body: string;
  glyph: 'chalice' | 'shield' | 'hourglass';
}

const CARDS: CardSpec[] = [
  { title: 'A Túlcsorduló Kehely', kind: 'Átok', color: '#e11d48', accent: '#f2c200', glyph: 'chalice', body: 'A következő három kérdésnél a bújó egy extra kártyát húzhat.' },
  { title: 'Vétó', kind: 'Erősítő', color: '#0060a8', accent: '#7cc0ff', glyph: 'shield', body: 'Utasítsd vissza a kereső épp feltett kérdését — válasz és húzás nélkül.' },
  { title: '+12 perc', kind: 'Időbónusz', color: '#3f9b3f', accent: '#bdeabd', glyph: 'hourglass', body: '12 perccel növeli a futamidődet. Tartsd a kezedben az idő elraktározásához.' },
];

/**
 * ISOLATED three.js proof-of-concept — reachable at /lab, wired into nothing else. Shows the
 * "Papírváros" direction with REAL WebGL (soft shadows, lighting) that CSS-3D can't do: a papercraft
 * card table with dealt 3D cards you can hover (lift + face you) and click (flip). It also proves the
 * Angular integration patterns for a future rollout:
 *   • the render loop runs via NgZone.runOutsideAngular (this app is zone-based) so it never triggers
 *     change detection every frame;
 *   • three.js is dynamically imported → its own lazy chunk, off the critical path;
 *   • full teardown on destroy (renderer/geometry/material/texture dispose, RAF + observers), matching
 *     the Leaflet disposal discipline;
 *   • a flat DOM HUD sits ON TOP of the WebGL stage, and scene ⇄ signal data flows both ways
 *     (buttons drive the scene; the raycaster's hovered card feeds a signal shown in the HUD).
 */
@Component({
  selector: 'app-three-poc',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './three-poc.html',
})
export class ThreePoc {
  private readonly zone = inject(NgZone);

  readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  readonly ready = signal(false);
  readonly hovered = signal<string | null>(null);

  private readonly reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // three.js handles (kept for the render loop + teardown).
  private three!: typeof import('three');
  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private raycaster?: THREE.Raycaster;
  private cards: THREE.Mesh[] = [];
  private pointer = { x: 0, y: 0, has: false };
  private raf = 0;
  private running = true;
  private clock = 0;
  private resizeObs?: ResizeObserver;
  private disposables: { dispose(): void }[] = [];
  private cleanups: (() => void)[] = [];

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Init only in the browser, after the host <div> exists.
    afterNextRender(() => void this.init());

    destroyRef.onDestroy(() => this.teardown());
    // Don't burn the GPU while backgrounded (mirrors the concept's battery guard).
    const onVis = () => (this.running = document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVis));
  }

  private async init(): Promise<void> {
    const THREE = (this.three = await import('three'));
    const el = this.host().nativeElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap DPR for mobile
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#171430');
    scene.fog = new THREE.Fog('#171430', 8, 20);

    const camera = (this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100));
    camera.position.set(0, 2.1, 5.3);
    camera.lookAt(0, 0.85, 0);

    // Dusk lighting: soft fill + a warm key that casts the papercraft shadows + a cool rim.
    scene.add(new THREE.AmbientLight('#9a92d6', 0.9));
    const key = new THREE.DirectionalLight('#ffe9c7', 2.1);
    key.position.set(-4, 7, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0008;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#5b6cff', 0.7);
    rim.position.set(5, 3, -4);
    scene.add(rim);

    // The "table": a kraft-paper plane that receives the card shadows.
    const tableGeo = new THREE.PlaneGeometry(60, 60);
    const tableMat = new THREE.MeshStandardMaterial({ color: '#d9cdb4', roughness: 0.98, metalness: 0 });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    scene.add(table);
    this.disposables.push(tableGeo, tableMat);

    const back = this.backTexture();
    CARDS.forEach((spec, i) => scene.add(this.buildCard(spec, back, i)));
    this.layout(true);

    this.raycaster = new THREE.Raycaster();
    this.bindEvents(el);
    this.observeResize(el);
    this.ready.set(true);

    // The render loop lives OUTSIDE Angular — no change detection per frame.
    this.zone.runOutsideAngular(() => {
      const loop = () => {
        this.raf = requestAnimationFrame(loop);
        if (this.running) {
          this.frame();
        }
      };
      loop();
    });
  }

  // ---- Scene building -------------------------------------------------------

  private buildCard(spec: CardSpec, back: THREE.Texture, index: number): THREE.Mesh {
    const THREE = this.three;
    const faceTex = this.faceTexture(spec);
    const edge = new THREE.MeshStandardMaterial({ color: '#f3ecdd', roughness: 0.9, metalness: 0 });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.72, metalness: 0 });
    const backMat = new THREE.MeshStandardMaterial({ map: back, roughness: 0.8, metalness: 0 });
    // BoxGeometry face order: +x,-x,+y,-y,+z(front),-z(back).
    const materials = [edge, edge, edge, edge, faceMat, backMat];
    const geo = new THREE.BoxGeometry(1.4, 2, 0.035);
    const mesh = new THREE.Mesh(geo, materials);
    mesh.castShadow = true;
    mesh.userData = { index, spec, flipped: false, hover: false, t: 1 };
    this.cards.push(mesh);
    this.disposables.push(geo, edge, faceMat, backMat, faceTex);
    return mesh;
  }

  /** Where each card should rest: an upright fanned "hand" floating above the table, facing you. */
  private layout(dealIn: boolean): void {
    const n = this.cards.length;
    this.cards.forEach((card, i) => {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5; // -0.5..0.5
      const base = {
        x: t * 1.55,
        y: 1.05,
        z: 0.15 - Math.abs(t) * 0.2,
        rx: -0.14, // slight back-tilt toward the camera
        ry: -t * 0.32, // fan
        rz: -t * 0.07,
      };
      card.userData['base'] = base;
      card.userData['flipped'] = false;
      if (dealIn && !this.reduced) {
        // Start stacked in a deck off to the right (backs up), then fly into the fan (staggered).
        card.position.set(2.8, 1.05, -1.4);
        card.rotation.set(-0.14, Math.PI, 0.25);
        card.userData['startAt'] = this.clock + i * 0.18;
      } else {
        card.position.set(base.x, base.y, base.z);
        card.rotation.set(base.rx, base.ry, base.rz);
        card.userData['startAt'] = 0;
      }
    });
  }

  // ---- Per-frame ------------------------------------------------------------

  private frame(): void {
    const dt = 1 / 60;
    this.clock += dt;
    const THREE = this.three;

    // Hover pick → drives the HUD label signal.
    let hoveredName: string | null = null;
    if (this.pointer.has && this.raycaster && this.camera) {
      this.raycaster.setFromCamera(new THREE.Vector2(this.pointer.x, this.pointer.y), this.camera);
      const hit = this.raycaster.intersectObjects(this.cards, false)[0];
      this.cards.forEach((c) => (c.userData['hover'] = false));
      if (hit) {
        hit.object.userData['hover'] = true;
        hoveredName = (hit.object.userData['spec'] as CardSpec).title;
      }
    }
    if (hoveredName !== this.hovered()) {
      this.zone.run(() => this.hovered.set(hoveredName)); // cross back into Angular for the HUD label
    }

    const lerp = this.reduced ? 1 : 0.14;
    this.cards.forEach((card) => {
      if (this.clock < (card.userData['startAt'] as number)) {
        return; // still stacked in the deck — its turn to fly in hasn't come yet
      }
      const base = card.userData['base'] as { x: number; y: number; z: number; rx: number; ry: number; rz: number };
      const hover = card.userData['hover'] as boolean;
      const flipped = card.userData['flipped'] as boolean;
      const bob = this.reduced ? 0 : Math.sin(this.clock * 1.4 + base.x * 3) * 0.03;

      const tx = base.x;
      const ty = base.y + (hover ? 0.45 : bob);
      const tz = base.z + (hover ? 0.8 : 0);
      const trx = hover ? 0 : base.rx;
      const try_ = base.ry + (flipped ? Math.PI : 0);
      const trz = hover ? 0 : base.rz;

      card.position.x += (tx - card.position.x) * lerp;
      card.position.y += (ty - card.position.y) * lerp;
      card.position.z += (tz - card.position.z) * lerp;
      card.rotation.x += (trx - card.rotation.x) * lerp;
      card.rotation.y += (try_ - card.rotation.y) * lerp;
      card.rotation.z += (trz - card.rotation.z) * lerp;
      const s = hover ? 1.06 : 1;
      card.scale.x += (s - card.scale.x) * lerp;
      card.scale.y += (s - card.scale.y) * lerp;
      card.scale.z += (s - card.scale.z) * lerp;
    });

    // Subtle camera parallax toward the pointer.
    if (this.camera && !this.reduced) {
      const px = this.pointer.has ? this.pointer.x : 0;
      const py = this.pointer.has ? this.pointer.y : 0;
      this.camera.position.x += (px * 0.6 - this.camera.position.x) * 0.04;
      this.camera.position.y += (2.1 - py * 0.4 - this.camera.position.y) * 0.04;
      this.camera.lookAt(0, 0.85, 0);
    }

    this.renderer!.render(this.scene!, this.camera!);
  }

  // ---- HUD actions (run in the Angular zone; they just set targets) ---------

  deal(): void {
    this.cards.forEach((c) => (c.userData['flipped'] = false));
    this.layout(true);
  }

  flipAll(): void {
    this.cards.forEach((c) => (c.userData['flipped'] = !c.userData['flipped']));
  }

  shuffle(): void {
    // Gather to a center stack, then re-fan (the lerp loop animates the motion).
    this.cards.forEach((c, i) => {
      c.userData['base'] = { x: 0.3, y: 0.02 + i * 0.04, z: 0, rx: -Math.PI / 2 + 0.28, ry: 0, rz: (Math.random() - 0.5) * 0.2 };
      c.userData['flipped'] = false;
    });
    setTimeout(() => this.layout(false), 420);
  }

  // ---- Events + teardown ----------------------------------------------------

  private bindEvents(el: HTMLElement): void {
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      this.pointer.has = true;
    };
    const leave = () => (this.pointer.has = false);
    const click = () => {
      const hit = this.cards.find((c) => c.userData['hover']);
      if (hit) {
        hit.userData['flipped'] = !hit.userData['flipped'];
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('click', click);
    this.cleanups.push(() => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('click', click);
    });
  }

  private observeResize(el: HTMLElement): void {
    this.resizeObs = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h || !this.renderer || !this.camera) {
        return;
      }
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
    this.resizeObs.observe(el);
  }

  private teardown(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.cleanups.forEach((fn) => fn());
    this.disposables.forEach((d) => d.dispose());
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }

  // ---- Canvas card textures (drawn once, uploaded as CanvasTexture) ----------

  private faceTexture(spec: CardSpec): THREE.CanvasTexture {
    const THREE = this.three;
    const W = 512;
    const H = 731;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;

    g.fillStyle = '#f6f1e6'; // paper body
    this.roundRect(g, 0, 0, W, H, 44);
    g.fill();
    g.fillStyle = spec.color; // header bar
    this.roundRect(g, 0, 0, W, 150, 44);
    g.fill();
    g.fillRect(0, 90, W, 60);
    g.fillStyle = '#ffffff';
    g.font = '700 44px ui-sans-serif, system-ui, sans-serif';
    g.textBaseline = 'middle';
    this.wrap(g, spec.title, 34, 66, W - 68, 48);
    g.fillStyle = this.tint(spec.color, 0.14); // emblem plate
    this.roundRect(g, 156, 210, 200, 200, 40);
    g.fill();
    this.drawGlyph(g, spec.glyph, 256, 310, spec.color);
    g.fillStyle = '#3a3547'; // body text
    g.font = '400 30px ui-sans-serif, system-ui, sans-serif';
    this.wrap(g, spec.body, 40, 470, W - 80, 40);
    g.fillStyle = spec.accent; // kind tag
    this.roundRect(g, 40, 632, 220, 58, 16);
    g.fill();
    g.fillStyle = '#1a1730';
    g.font = '800 26px ui-sans-serif, system-ui, sans-serif';
    g.fillText(spec.kind.toUpperCase(), 62, 663);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  private backTexture(): THREE.CanvasTexture {
    const THREE = this.three;
    const W = 512;
    const H = 731;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e7dcc4';
    this.roundRect(g, 0, 0, W, H, 44);
    g.fill();
    const metro = ['#f2c200', '#d5232a', '#0060a8', '#3f9b3f']; // metro-line stripe motif
    const seg = (W - 128) / 4;
    metro.forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect(64 + i * seg, 96, seg - 8, 14);
      g.fillRect(64 + i * seg, H - 110, seg - 8, 14);
    });
    g.fillStyle = '#171430'; // center monogram plate
    this.roundRect(g, 146, 250, 220, 220, 44);
    g.fill();
    g.fillStyle = '#f2c200';
    g.font = '900 120px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', 256, 356);
    g.fillStyle = '#8a8172';
    g.font = '800 24px ui-sans-serif, system-ui, sans-serif';
    g.fillText('PAPÍRVÁROS', 256, 545);
    g.textAlign = 'left';

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  private drawGlyph(g: CanvasRenderingContext2D, kind: CardSpec['glyph'], cx: number, cy: number, color: string): void {
    g.strokeStyle = color;
    g.lineWidth = 9;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (kind === 'hourglass') {
      g.beginPath();
      g.moveTo(cx - 42, cy - 52);
      g.lineTo(cx + 42, cy - 52);
      g.lineTo(cx + 6, cy);
      g.lineTo(cx + 42, cy + 52);
      g.lineTo(cx - 42, cy + 52);
      g.lineTo(cx - 6, cy);
      g.closePath();
      g.stroke();
    } else if (kind === 'shield') {
      g.beginPath();
      g.moveTo(cx, cy - 56);
      g.lineTo(cx + 46, cy - 34);
      g.lineTo(cx + 46, cy + 6);
      g.quadraticCurveTo(cx + 46, cy + 46, cx, cy + 60);
      g.quadraticCurveTo(cx - 46, cy + 46, cx - 46, cy + 6);
      g.lineTo(cx - 46, cy - 34);
      g.closePath();
      g.stroke();
    } else {
      g.beginPath(); // chalice
      g.moveTo(cx - 40, cy - 46);
      g.lineTo(cx + 40, cy - 46);
      g.quadraticCurveTo(cx + 40, cy + 10, cx, cy + 20);
      g.quadraticCurveTo(cx - 40, cy + 10, cx - 40, cy - 46);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.moveTo(cx, cy + 20);
      g.lineTo(cx, cy + 52);
      g.moveTo(cx - 30, cy + 58);
      g.lineTo(cx + 30, cy + 58);
      g.stroke();
    }
  }

  private roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  private wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): void {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (g.measureText(test).width > maxW && line) {
        g.fillText(line, x, yy);
        line = word;
        yy += lh;
      } else {
        line = test;
      }
    }
    if (line) {
      g.fillText(line, x, yy);
    }
  }

  private tint(hex: string, amt: number): string {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * amt + 255 * (1 - amt));
    const gg = Math.round(((n >> 8) & 255) * amt + 255 * (1 - amt));
    const b = Math.round((n & 255) * amt + 255 * (1 - amt));
    return `rgb(${r},${gg},${b})`;
  }
}
