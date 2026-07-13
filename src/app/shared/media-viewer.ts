import { Component, Injectable, inject, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { Icon } from './icon';

type Media = { url: string; kind: 'image' | 'video' };

/**
 * A single app-wide media lightbox. Any component can call `media.open(url)` to show a photo or
 * video clue full-screen instead of dumping the player onto a raw file in a new browser tab.
 * The kind is inferred from the URL extension so the same entry point serves both.
 */
@Injectable({ providedIn: 'root' })
export class MediaViewerService {
  readonly current = signal<Media | null>(null);

  open(url: string | null | undefined): void {
    if (!url) {
      return;
    }
    this.current.set({ url, kind: this.kindOf(url) });
  }

  close(): void {
    this.current.set(null);
  }

  private kindOf(url: string): 'image' | 'video' {
    return /\.(mp4|webm|mov|m4v|3gp|ogv)(\?|#|$)/i.test(url) ? 'video' : 'image';
  }
}

/** The lightbox overlay itself — mounted once at the app root. */
@Component({
  selector: 'app-media-viewer',
  imports: [TranslocoModule, Icon],
  host: { '(document:keydown.escape)': 'media.close()' },
  template: `
    @if (media.current(); as m) {
      <div class="fixed inset-0 z-[950] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" (click)="media.close()" *transloco="let t">
        <button (click)="media.close()" [attr.aria-label]="t('common.close')"
                class="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25">
          <app-icon name="x" [size]="22" />
        </button>
        @if (m.kind === 'video') {
          <video [src]="m.url" controls autoplay playsinline (click)="$event.stopPropagation()"
                 class="max-h-[86vh] max-w-full rounded-xl bg-black shadow-2xl"></video>
        } @else {
          <img [src]="m.url" alt="" (click)="$event.stopPropagation()"
               class="max-h-[86vh] max-w-full rounded-xl object-contain shadow-2xl" />
        }
      </div>
    }
  `,
})
export class MediaViewer {
  readonly media = inject(MediaViewerService);
}
