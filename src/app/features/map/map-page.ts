import { area } from '@turf/turf';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { applyQuestions, DeductionQuestion, playArea } from '../../core/maps/deduction';
import { Position } from '../../core/models/models';
import { DeductionMap } from './deduction-map';

type Mode = 'idle' | 'radar' | 'thermo';

@Component({
  selector: 'app-map-page',
  imports: [FormsModule, RouterLink, DeductionMap],
  template: `
    <main class="mx-auto w-full max-w-6xl space-y-4 p-4">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <a routerLink="/" class="text-sm text-rose-600">← Home</a>
          <h1 class="text-lg font-bold">Deduction map</h1>
        </div>
        @if (remainingKm2(); as km2) {
          <span class="rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-800">remaining ≈ {{ km2 }} km²</span>
        }
      </header>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="space-y-2">
          <app-deduction-map [candidate]="candidate()" [questions]="questions()" [autoZoom]="autoZoom()"
                             (mapClick)="onMapClick($event)" />
          <p class="text-xs text-gray-500 dark:text-gray-400">
            @switch (mode()) {
              @case ('radar') { Click the map to drop a radar centre. }
              @case ('thermo') {
                @if (pendingA()) { Click the map for point B (warm end). } @else { Click the map for point A (cold end). }
              }
              @default { Add a question, then click the map to place it. }
            }
          </p>
        </div>

        <div class="space-y-4 text-sm">
          <section class="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <h2 class="font-semibold">Add a question</h2>
            <div class="flex flex-wrap gap-2">
              <button (click)="mode.set('radar'); pendingA.set(null)" [class]="mode() === 'radar' ? btnActive : btn">Radar</button>
              <button (click)="mode.set('thermo'); pendingA.set(null)" [class]="mode() === 'thermo' ? btnActive : btn">Thermometer</button>
              <button (click)="mode.set('idle'); pendingA.set(null)" [class]="btnOutline">Cancel</button>
            </div>
            <label class="flex items-center gap-2">
              <input type="checkbox" [ngModel]="autoZoom()" (ngModelChange)="autoZoom.set($event)" />
              Auto-zoom to remaining area
            </label>
          </section>

          <section class="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <h2 class="w-full font-semibold">Play area</h2>
            <label class="flex flex-col">Lat
              <input type="number" step="0.001" [ngModel]="centerLat()" (ngModelChange)="centerLat.set($event)" [class]="num" />
            </label>
            <label class="flex flex-col">Lng
              <input type="number" step="0.001" [ngModel]="centerLng()" (ngModelChange)="centerLng.set($event)" [class]="num" />
            </label>
            <label class="flex flex-col">Radius km
              <input type="number" min="1" [ngModel]="radiusKm()" (ngModelChange)="radiusKm.set($event)" [class]="num" />
            </label>
          </section>

          <section class="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <h2 class="font-semibold">Questions ({{ questions().length }})</h2>
            @for (q of questions(); track q.id) {
              <div class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2 dark:border-gray-700">
                @if (q.type === 'radar') {
                  <span class="font-medium">Radar</span>
                  <select [ngModel]="q.within" (ngModelChange)="setRadarWithin(q.id, $event)" [class]="sel">
                    <option [ngValue]="true">Inside</option>
                    <option [ngValue]="false">Outside</option>
                    <option [ngValue]="null">Unknown</option>
                  </select>
                  <input type="number" min="1" [ngModel]="q.radiusKm" (ngModelChange)="setRadarRadius(q.id, $event)" [class]="num" />
                  <span class="text-xs text-gray-500">km</span>
                } @else {
                  <span class="font-medium">Thermometer</span>
                  <select [ngModel]="q.warmer" (ngModelChange)="setThermoWarmer(q.id, $event)" [class]="sel">
                    <option [ngValue]="true">Warmer → B</option>
                    <option [ngValue]="false">Colder → A</option>
                    <option [ngValue]="null">Unknown</option>
                  </select>
                }
                <button (click)="remove(q.id)" [class]="btnOutline + ' ml-auto'">Remove</button>
              </div>
            } @empty {
              <p class="text-gray-400">No questions yet.</p>
            }
          </section>
        </div>
      </div>
    </main>
  `,
})
export class MapPage {
  readonly btn = 'rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700';
  readonly btnActive = 'rounded-lg bg-rose-800 px-3 py-2 text-sm font-medium text-white ring-2 ring-rose-300';
  readonly btnOutline = 'rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800';
  readonly sel = 'rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-800';
  readonly num = 'w-24 rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-800';

  readonly centerLat = signal(47.4979);
  readonly centerLng = signal(19.0402);
  readonly radiusKm = signal(50);
  readonly autoZoom = signal(true);

  readonly questions = signal<DeductionQuestion[]>([]);
  readonly mode = signal<Mode>('idle');
  readonly pendingA = signal<Position | null>(null);

  readonly candidate = computed(() => {
    try {
      return applyQuestions(playArea(this.centerLat(), this.centerLng(), this.radiusKm()), this.questions());
    } catch {
      return null;
    }
  });

  readonly remainingKm2 = computed(() => {
    const c = this.candidate();

    return c ? Math.round(area(c) / 1_000_000).toLocaleString() : null;
  });

  onMapClick(p: Position): void {
    if (this.mode() === 'radar') {
      this.add({ id: crypto.randomUUID(), type: 'radar', lat: p.lat, lng: p.lng, radiusKm: 5, within: true });
      this.mode.set('idle');
    } else if (this.mode() === 'thermo') {
      const a = this.pendingA();
      if (!a) {
        this.pendingA.set(p);
      } else {
        this.add({ id: crypto.randomUUID(), type: 'thermometer', aLat: a.lat, aLng: a.lng, bLat: p.lat, bLng: p.lng, warmer: true });
        this.pendingA.set(null);
        this.mode.set('idle');
      }
    }
  }

  setRadarWithin(id: string, within: boolean | null): void {
    this.patch(id, (q) => q.type === 'radar' && (q.within = within));
  }

  setRadarRadius(id: string, radiusKm: number): void {
    this.patch(id, (q) => q.type === 'radar' && (q.radiusKm = radiusKm));
  }

  setThermoWarmer(id: string, warmer: boolean | null): void {
    this.patch(id, (q) => q.type === 'thermometer' && (q.warmer = warmer));
  }

  remove(id: string): void {
    this.questions.update((qs) => qs.filter((q) => q.id !== id));
  }

  private add(q: DeductionQuestion): void {
    this.questions.update((qs) => [...qs, q]);
  }

  private patch(id: string, mutate: (q: DeductionQuestion) => unknown): void {
    this.questions.update((qs) =>
      qs.map((q) => {
        if (q.id !== id) {
          return q;
        }
        const copy = { ...q } as DeductionQuestion;
        mutate(copy);

        return copy;
      }),
    );
  }
}
