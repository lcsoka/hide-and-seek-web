import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { CustomCurse, CustomQuestion } from '../../core/models';
import { ApiClient } from '../../core/services/api-client';

/** Manage your own custom curses + questions (they join the games you host). */
@Component({
  selector: 'app-my-content',
  host: { class: 'block min-h-[100dvh] bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white' },
  imports: [FormsModule, RouterLink, TranslocoModule],
  templateUrl: './my-content.html',
})
export class MyContentPage {
  private readonly api = inject(ApiClient);

  readonly curses = signal<CustomCurse[]>([]);
  readonly questions = signal<CustomQuestion[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  // Curse form
  cName = '';
  cCost = '';
  cDesc = '';
  cProof = false;
  cBlocks = false;
  cDuration: number | null = null;

  // Question form
  qTitle = '';
  qPrompt = '';

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const r = await this.api.myContent();
      this.curses.set(r.curses);
      this.questions.set(r.questions);
    } catch {
      // not signed in / offline
    }
  }

  async addCurse(): Promise<void> {
    if (!this.cName.trim() || this.busy()) {
      return;
    }
    await this.run(async () => {
      const c = await this.api.createCurse({
        name: this.cName.trim(),
        cost: this.cCost.trim(),
        description: this.cDesc.trim(),
        requires_proof: this.cProof,
        blocks_asking: this.cBlocks,
        duration_minutes: this.cDuration ?? undefined,
      });
      this.curses.update((l) => [c, ...l]);
      this.cName = this.cCost = this.cDesc = '';
      this.cProof = this.cBlocks = false;
      this.cDuration = null;
    });
  }

  async removeCurse(id: string): Promise<void> {
    await this.api.deleteCurse(id);
    this.curses.update((l) => l.filter((c) => c.id !== id));
  }

  async addQuestion(): Promise<void> {
    if (!this.qTitle.trim() || !this.qPrompt.trim() || this.busy()) {
      return;
    }
    await this.run(async () => {
      const q = await this.api.createQuestion({ title: this.qTitle.trim(), prompt: this.qPrompt.trim() });
      this.questions.update((l) => [q, ...l]);
      this.qTitle = this.qPrompt = '';
    });
  }

  async removeQuestion(id: string): Promise<void> {
    await this.api.deleteQuestion(id);
    this.questions.update((l) => l.filter((q) => q.id !== id));
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (e: unknown) {
      this.error.set((e as { error?: { message?: string } })?.error?.message ?? 'Something went wrong.');
    } finally {
      this.busy.set(false);
    }
  }
}
