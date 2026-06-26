import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';

interface DuoView {
  name: string;
  role: 'hider' | 'seeker';
  playerId: string;
  url: string;
  safe: SafeResourceUrl;
}

/**
 * Dev "duo" view: spins up a real game with a host + N seekers (each its own guest
 * identity), then renders them SIDE BY SIDE in iframes. Each pane carries its own
 * `?token=&player=` so the same browser runs several independent clients at once — you
 * can watch realtime sync (joins, questions, curses) without juggling browser profiles.
 */
@Component({
  selector: 'app-dev-duo',
  imports: [FormsModule],
  template: `
    <main class="flex h-[100dvh] flex-col">
      <header class="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
        <h1 class="text-lg font-bold">Duo test game</h1>
        <label class="flex items-center gap-1 text-sm">Seekers
          <input type="number" min="1" max="3" [(ngModel)]="seekers" class="w-14 rounded border border-gray-300 p-1 dark:border-gray-600 dark:bg-gray-800" />
        </label>
        <select [(ngModel)]="size" class="rounded border border-gray-300 p-1 text-sm dark:border-gray-600 dark:bg-gray-800">
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
        <button (click)="create()" [disabled]="busy()"
                class="rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
          {{ busy() ? 'Creating…' : 'Create duo game' }}
        </button>

        <span class="mx-1 h-6 w-px bg-gray-300 dark:bg-gray-700"></span>
        <label class="flex items-center gap-1 text-sm">Spectate
          <input [(ngModel)]="spectateId" placeholder="session id or code"
                 class="w-48 rounded border border-gray-300 p-1 dark:border-gray-600 dark:bg-gray-800" />
        </label>
        <button (click)="spectate()" [disabled]="busy() || !spectateId.trim()"
                class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800">
          Watch existing
        </button>

        @if (joinCode()) {
          <span class="text-sm text-gray-500 dark:text-gray-400">Code <b class="font-mono">{{ joinCode() }}</b> — others can join too.</span>
        }
        @if (error()) { <span class="text-sm text-red-600">{{ error() }}</span> }
      </header>

      @if (views().length) {
        <div class="flex flex-1 divide-x divide-gray-300 overflow-hidden dark:divide-gray-700">
          @for (v of views(); track v.playerId) {
            <section class="flex min-w-0 flex-1 flex-col">
              <div class="flex items-center justify-between gap-2 bg-gray-100 px-3 py-1.5 text-sm dark:bg-gray-800">
                <span class="font-semibold">{{ v.name }}
                  <span class="rounded px-1.5 py-0.5 text-xs" [class]="v.role === 'hider' ? 'bg-rose-200 text-rose-800' : 'bg-blue-200 text-blue-800'">{{ v.role }}</span>
                </span>
                <a [href]="v.url" target="_blank" rel="noopener" class="text-xs text-rose-600 hover:underline">open in window ↗</a>
              </div>
              <iframe [src]="v.safe" class="min-h-0 flex-1 border-0" [title]="v.name"></iframe>
            </section>
          }
        </div>
      } @else {
        <div class="grid flex-1 place-items-center p-6 text-center text-gray-400">
          <p>Create a game to watch a host and seeker(s) play side by side,<br />or spectate an existing session by id/code.<br />Each pane is a real, independent client — drive any of them.</p>
        </div>
      }
    </main>
  `,
})
export class DevDuo {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly base = environment.apiBase;

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly views = signal<DuoView[]>([]);
  readonly joinCode = signal<string | null>(null);
  seekers = 1;
  size = 'medium';
  spectateId = '';

  async create(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.views.set([]);
    try {
      const host = await this.guest('Host');
      const session = await this.post('/sessions', host.token, { city: 'budapest', game_size: this.size, display_name: 'Host' });
      this.joinCode.set(session.join_code);

      const views: DuoView[] = [this.view('Host', 'hider', session.id, session.host_player_id, host.token)];
      const count = Math.max(1, Math.min(3, Number(this.seekers) || 1));
      for (let i = 1; i <= count; i++) {
        const g = await this.guest(`Seeker ${i}`);
        const joined = await this.post(`/sessions/${session.join_code}/join`, g.token, { display_name: `Seeker ${i}` });
        views.push(this.view(`Seeker ${i}`, 'seeker', session.id, joined.player.id, g.token));
      }
      this.views.set(views);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Could not create the duo game.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Watch an EXISTING session: mint a token for each of its players and render their real views. */
  async spectate(): Promise<void> {
    const id = this.spectateId.trim();
    this.busy.set(true);
    this.error.set(null);
    this.views.set([]);
    try {
      const god = await this.debug(`/sessions/${id}/debug/state`);
      const sessionId: string = god.session_id ?? id;
      this.joinCode.set(god.state_data?.join_code ?? null);
      const players: any[] = god.players ?? [];
      if (!players.length) {
        throw new Error('That session has no players yet.');
      }

      const views: DuoView[] = [];
      for (const p of players) {
        const { token } = await this.debug(`/sessions/${sessionId}/debug/token`, { player_id: p.id });
        const role = p.role === 'hider' ? 'hider' : 'seeker';
        views.push(this.view(p.display_name ?? 'Player', role, sessionId, p.id, token));
      }
      this.views.set(views);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Could not open that session.');
    } finally {
      this.busy.set(false);
    }
  }

  /** A debug-API call (GET when no body) carrying the dev token. */
  private async debug(path: string, body?: unknown): Promise<any> {
    const res = await fetch(this.base + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Developer-Token': environment.developerToken },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      throw new Error(`${path} → ${res.status}`);
    }

    return res.json();
  }

  private view(name: string, role: 'hider' | 'seeker', sessionId: string, playerId: string, token: string): DuoView {
    const url = `/s/${sessionId}?token=${encodeURIComponent(token)}&player=${playerId}`;

    return { name, role, playerId, url, safe: this.sanitizer.bypassSecurityTrustResourceUrl(url) };
  }

  private guest(name: string): Promise<{ token: string }> {
    return this.post('/auth/guest', null, { display_name: name });
  }

  private async post(path: string, token: string | null, body: unknown): Promise<any> {
    const res = await fetch(this.base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`${path} → ${res.status}`);
    }

    return res.json();
  }
}
