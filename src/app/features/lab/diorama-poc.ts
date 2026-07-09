import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, NgZone, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
// Type-only import (erased at build) — the runtime `await import('three')` makes the lazy WebGL chunk.
import type * as THREE from 'three';

/** Small deterministic RNG so the skyline is a fixed, curated layout (not random each load). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ISOLATED three.js proof-of-concept #2 — reachable at /lab/diorama, wired into nothing else. The
 * second "hero moment" from the concept: a slowly rotating papercraft city on a turntable — extruded
 * buildings with glowing dusk windows, a river + bridge, a hill, trees, and a metro-coloured transit
 * ring with little trams looping around it. A dusk/day toggle swaps the lighting mood. Same Angular
 * integration patterns as the card POC (lazy import, runOutsideAngular loop, full dispose on destroy).
 */
@Component({
  selector: 'app-diorama-poc',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './diorama-poc.html',
})
export class DioramaPoc {
  private readonly zone = inject(NgZone);

  readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  readonly ready = signal(false);
  readonly rotating = signal(true);
  readonly dusk = signal(true);

  private readonly reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  private three!: typeof import('three');
  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private turntable?: THREE.Group;
  private ambient?: THREE.AmbientLight;
  private key?: THREE.DirectionalLight;
  private rim?: THREE.DirectionalLight;
  private buildingMats: THREE.MeshStandardMaterial[] = [];
  private trams: { mesh: THREE.Object3D; u: number; speed: number; path: (u: number) => { x: number; z: number; a: number } }[] = [];
  private river?: THREE.Mesh;

  private raf = 0;
  private running = true;
  private clock = 0;
  private resizeObs?: ResizeObserver;
  private disposables: { dispose(): void }[] = [];

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => void this.init());
    destroyRef.onDestroy(() => this.teardown());
    const onVis = () => (this.running = document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVis));
  }

  toggleRotate(): void {
    this.rotating.update((r) => !r);
  }

  toggleDusk(): void {
    this.dusk.update((d) => !d);
    this.applyMood();
  }

  private async init(): Promise<void> {
    const THREE = (this.three = await import('three'));
    const el = this.host().nativeElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    const camera = (this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100));
    camera.position.set(0, 9, 17.5);
    camera.lookAt(0, 0.4, 0);

    this.ambient = new THREE.AmbientLight('#ffffff', 1);
    scene.add(this.ambient);
    this.key = new THREE.DirectionalLight('#ffffff', 2);
    this.key.position.set(-6, 10, 5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 40;
    this.key.shadow.camera.left = -10;
    this.key.shadow.camera.right = 10;
    this.key.shadow.camera.top = 10;
    this.key.shadow.camera.bottom = -10;
    this.key.shadow.bias = -0.0006;
    scene.add(this.key);
    this.rim = new THREE.DirectionalLight('#5b6cff', 0.6);
    this.rim.position.set(7, 4, -6);
    scene.add(this.rim);

    this.buildCity();
    this.applyMood();

    this.observeResize(el);
    this.ready.set(true);

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

  // ---- City ----------------------------------------------------------------

  private buildCity(): void {
    const THREE = this.three;
    const g = (this.turntable = new THREE.Group());
    this.scene!.add(g);
    const rng = mulberry32(20260709);

    // Base disc + ground the city sits on.
    const discGeo = new THREE.CylinderGeometry(8, 8.2, 0.6, 64);
    const discMat = new THREE.MeshStandardMaterial({ color: '#d9cdb4', roughness: 1 });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = -0.3;
    disc.receiveShadow = true;
    g.add(disc);
    this.disposables.push(discGeo, discMat);

    // River band + bridge.
    const riverGeo = new THREE.PlaneGeometry(3, 17);
    const riverMat = new THREE.MeshStandardMaterial({ color: '#26406b', roughness: 0.35, metalness: 0.25 });
    const river = (this.river = new THREE.Mesh(riverGeo, riverMat));
    river.rotation.x = -Math.PI / 2;
    river.position.y = 0.03;
    g.add(river);
    this.disposables.push(riverGeo, riverMat);
    this.buildBridge(g);

    // Shared warm-window texture for the glowing dusk facades.
    const winTex = this.windowTexture();
    const kraft = ['#e7dcc4', '#e0d3b6', '#d7c8a6', '#efe6d2', '#dccdad'];
    const boxGeoCache = new Map<string, THREE.BoxGeometry>();

    for (let gx = -7; gx <= 7; gx += 1.15) {
      for (let gz = -7.5; gz <= 7.5; gz += 1.15) {
        if (Math.hypot(gx, gz) > 7) continue; // keep within the disc
        if (Math.abs(gx) < 1.7) continue; // leave the river clear
        if (rng() < 0.28) continue; // gaps for streets/parks
        const jitterX = (rng() - 0.5) * 0.35;
        const jitterZ = (rng() - 0.5) * 0.35;
        const central = 1 - Math.min(1, Math.hypot(gx, gz) / 7); // taller toward the middle
        const height = 0.6 + rng() * 1.4 + central * 2.2;
        const bw = 0.55 + rng() * 0.4;
        const bd = 0.55 + rng() * 0.4;

        const key = `${bw.toFixed(2)}x${height.toFixed(2)}x${bd.toFixed(2)}`;
        let geo = boxGeoCache.get(key);
        if (!geo) {
          geo = new THREE.BoxGeometry(bw, height, bd);
          boxGeoCache.set(key, geo);
          this.disposables.push(geo);
        }
        const mat = new THREE.MeshStandardMaterial({
          color: kraft[Math.floor(rng() * kraft.length)],
          roughness: 0.92,
          emissive: '#ffffff',
          emissiveMap: winTex,
          emissiveIntensity: 0,
        });
        this.buildingMats.push(mat);
        this.disposables.push(mat);
        const b = new THREE.Mesh(geo, mat);
        b.position.set(gx + jitterX, height / 2, gz + jitterZ);
        b.rotation.y = Math.round(rng() * 4) * (Math.PI / 8);
        b.castShadow = true;
        b.receiveShadow = true;
        g.add(b);
      }
    }
    this.disposables.push(winTex);

    // A hill (Gellért-ish) with a tiny statue spire, and scattered trees.
    this.buildHill(g, -4.5, 3.4);
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2;
      const r = 3 + rng() * 4;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x) < 1.7) continue;
      this.addTree(g, x, z, 0.3 + rng() * 0.3);
    }

    // Metro-coloured transit: a red ring + a blue line along the near bank, with trams looping.
    this.buildTransit(g);
  }

  private buildBridge(g: THREE.Group): void {
    const THREE = this.three;
    const towerGeo = new THREE.BoxGeometry(0.4, 2.4, 0.4);
    const deckGeo = new THREE.BoxGeometry(3.8, 0.14, 0.7);
    const mat = new THREE.MeshStandardMaterial({ color: '#cbb896', roughness: 0.9 });
    this.disposables.push(towerGeo, deckGeo, mat);
    const deck = new THREE.Mesh(deckGeo, mat);
    deck.position.set(0, 0.75, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    g.add(deck);
    for (const x of [-1.4, 1.4]) {
      const tower = new THREE.Mesh(towerGeo, mat);
      tower.position.set(x, 1.2, 0);
      tower.castShadow = true;
      g.add(tower);
    }
  }

  private buildHill(g: THREE.Group, x: number, z: number): void {
    const THREE = this.three;
    const coneGeo = new THREE.ConeGeometry(1.7, 1.6, 7);
    const coneMat = new THREE.MeshStandardMaterial({ color: '#b9c39a', roughness: 1, flatShading: true });
    const hill = new THREE.Mesh(coneGeo, coneMat);
    hill.position.set(x, 0.8, z);
    hill.castShadow = true;
    hill.receiveShadow = true;
    g.add(hill);
    const spireGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.6, 6);
    const spireMat = new THREE.MeshStandardMaterial({ color: '#efe7d4', roughness: 0.8 });
    const spire = new THREE.Mesh(spireGeo, spireMat);
    spire.position.set(x, 1.85, z);
    spire.castShadow = true;
    g.add(spire);
    this.disposables.push(coneGeo, coneMat, spireGeo, spireMat);
  }

  private addTree(g: THREE.Group, x: number, z: number, s: number): void {
    const THREE = this.three;
    const geo = new THREE.ConeGeometry(s, s * 2.6, 6);
    const mat = new THREE.MeshStandardMaterial({ color: '#5f8f52', roughness: 1, flatShading: true });
    const t = new THREE.Mesh(geo, mat);
    t.position.set(x, s * 1.3, z);
    t.castShadow = true;
    g.add(t);
    this.disposables.push(geo, mat);
  }

  private buildTransit(g: THREE.Group): void {
    const THREE = this.three;
    // Red ring track (an elliptical torus laid flat).
    const ringGeo = new THREE.TorusGeometry(1, 0.045, 8, 96);
    const ringMat = new THREE.MeshStandardMaterial({ color: '#d5232a', roughness: 0.6, emissive: '#d5232a', emissiveIntensity: 0.25 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.set(5, 3.4, 1);
    ring.position.y = 0.12;
    g.add(ring);
    this.disposables.push(ringGeo, ringMat);
    const ringPath = (u: number) => {
      const th = u * Math.PI * 2;
      return { x: Math.cos(th) * 5, z: Math.sin(th) * 3.4, a: Math.atan2(Math.cos(th) * 3.4, -Math.sin(th) * 5) };
    };
    this.addTram(g, '#d5232a', ringPath, 0.05, 0);
    this.addTram(g, '#f2c200', ringPath, 0.05, 0.5);

    // Blue straight line along the near river bank.
    const lineGeo = new THREE.BoxGeometry(0.09, 0.03, 12);
    const lineMat = new THREE.MeshStandardMaterial({ color: '#0060a8', roughness: 0.6, emissive: '#0060a8', emissiveIntensity: 0.25 });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.set(2.4, 0.12, 0);
    g.add(line);
    this.disposables.push(lineGeo, lineMat);
    const linePath = (u: number) => ({ x: 2.4, z: (u - 0.5) * 12, a: 0 });
    this.addTram(g, '#0060a8', linePath, 0.07, 0.2);
  }

  private addTram(g: THREE.Group, color: string, path: (u: number) => { x: number; z: number; a: number }, speed: number, u0: number): void {
    const THREE = this.three;
    const bodyGeo = new THREE.BoxGeometry(0.34, 0.26, 0.72);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.35 });
    const tram = new THREE.Mesh(bodyGeo, bodyMat);
    tram.castShadow = true;
    // Warm headlight strip.
    const lampGeo = new THREE.BoxGeometry(0.22, 0.08, 0.02);
    const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c8', emissive: '#ffdd88', emissiveIntensity: 1.4 });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(0, 0.03, 0.37);
    tram.add(lamp);
    g.add(tram);
    this.disposables.push(bodyGeo, bodyMat, lampGeo, lampMat);
    this.trams.push({ mesh: tram, u: u0, speed, path });
  }

  /** Warm window grid, tiled onto each facade as an emissive map (dark = wall, bright = lit window). */
  private windowTexture(): THREE.CanvasTexture {
    const THREE = this.three;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 64, 96);
    const rng = mulberry32(7);
    for (let y = 8; y < 90; y += 14) {
      for (let x = 8; x < 58; x += 14) {
        g.fillStyle = rng() > 0.35 ? '#ffd488' : '#241c10';
        g.fillRect(x, y, 8, 9);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 2);
    return tex;
  }

  // ---- Mood + frame ---------------------------------------------------------

  private applyMood(): void {
    const THREE = this.three;
    const dusk = this.dusk();
    const bg = dusk ? '#171430' : '#c3dcf2';
    this.scene!.background = new THREE.Color(bg);
    this.scene!.fog = new THREE.Fog(bg, 14, 34);
    this.ambient!.color.set(dusk ? '#9a92d6' : '#ffffff');
    this.ambient!.intensity = dusk ? 0.7 : 1.15;
    this.key!.color.set(dusk ? '#ffe4bd' : '#fff6e6');
    this.key!.intensity = dusk ? 1.7 : 2.3;
    this.rim!.intensity = dusk ? 0.7 : 0.3;
    (this.river!.material as THREE.MeshStandardMaterial).color.set(dusk ? '#26406b' : '#4a86c0');
    this.buildingMats.forEach((m) => (m.emissiveIntensity = dusk ? 0.9 : 0));
  }

  private frame(): void {
    this.clock += 1 / 60;
    if (this.turntable && this.rotating() && !this.reduced) {
      this.turntable.rotation.y += 0.0016;
    }
    for (const t of this.trams) {
      if (!this.reduced) {
        t.u = (t.u + t.speed / 60) % 1;
      }
      const p = t.path(t.u);
      t.mesh.position.set(p.x, 0.24, p.z);
      t.mesh.rotation.y = p.a;
    }
    this.renderer!.render(this.scene!, this.camera!);
  }

  // ---- Resize + teardown ----------------------------------------------------

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
    this.disposables.forEach((d) => d.dispose());
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
