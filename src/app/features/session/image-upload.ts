import { Component, inject, input, output, signal } from '@angular/core';
import { ApiClient } from '../../core/services/api-client';

const MAX_VIDEO_MB = 78; // under the server's 80 MB cap; the browser can't downscale video

/**
 * A button-styled file picker that uploads a photo OR video and emits the public URL. By default it
 * does NOT force the camera (no `capture`), so the phone offers the gallery too; pass capture:
 * 'environment' to force the rear camera. Images are downscaled in the browser; videos upload as-is
 * (with a size guard, since we can't shrink them).
 */
@Component({
  selector: 'app-image-upload',
  template: `
    <label [class]="cssClass()" [class.opacity-50]="busy()">
      <input type="file" [accept]="accept()" [attr.capture]="capture()" class="hidden" [disabled]="busy()" (change)="onPick($event)" />
      {{ busy() ? 'Feltöltés…' : label() }}
    </label>
    @if (err(); as e) { <p class="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{{ e }}</p> }
  `,
})
export class ImageUpload {
  private readonly api = inject(ApiClient);

  readonly sessionId = input.required<string>();
  readonly label = input('Feltöltés');
  readonly accept = input('image/*'); // pass 'image/*,video/*' or 'video/*' to allow video
  readonly capture = input<string | null>(null); // 'environment' forces the camera; null = user picks (camera OR gallery)
  readonly cssClass = input('inline-block cursor-pointer rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700');
  readonly uploaded = output<string>();

  readonly busy = signal(false);
  readonly err = signal<string | null>(null);

  async onPick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.err.set(null);

    const isVideo = file.type.startsWith('video/');
    if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) {
      this.err.set(`A videó túl nagy (max ${MAX_VIDEO_MB} MB) — vegyél fel rövidebbet.`);
      input.value = '';
      return;
    }

    this.busy.set(true);
    try {
      const upload = isVideo ? file : await this.downscale(file);
      const { url } = await this.api.uploadMedia(this.sessionId(), upload);
      this.uploaded.emit(url);
    } catch (e: unknown) {
      this.err.set(this.uploadError(e, isVideo));
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }

  /** Turn an upload failure into a specific, actionable message instead of a blanket "try again". */
  private uploadError(e: unknown, isVideo: boolean): string {
    const err = e as { status?: number; error?: { message?: string; errors?: Record<string, string[]> } };
    const status = err?.status ?? 0;
    const kind = isVideo ? 'videó' : 'kép';
    // PHP rejected the body before Laravel (over post_max_size), or Laravel's own size/type rule tripped.
    if (status === 413) {
      return `A ${kind} túl nagy a szerver számára${isVideo ? ` (max ${MAX_VIDEO_MB} MB)` : ''}.`;
    }
    if (status === 422) {
      // mimes/max validation — surface the server's reason if we have it, else a clear generic.
      const msg = err?.error?.message ?? err?.error?.errors?.['image']?.[0] ?? '';
      return /large|kilobytes|max/i.test(msg)
        ? `A ${kind} túl nagy — válassz kisebbet${isVideo ? ` (max ${MAX_VIDEO_MB} MB)` : ''}.`
        : `Nem támogatott ${kind}formátum — próbálj másikat.`;
    }
    if (status === 0) {
      return 'Nincs internetkapcsolat, vagy megszakadt a feltöltés.';
    }
    if (status >= 500) {
      return 'Szerverhiba a feltöltésnél — próbáld újra kicsit később.';
    }
    return 'A feltöltés nem sikerült — próbáld újra.';
  }

  /**
   * Phone photos are 3–12 MB and trip the server's upload limit. Downscale to a sane max dimension +
   * JPEG quality in the browser first (usually <500 KB). Falls back to the original file on error.
   * Only reached for images — videos are uploaded untouched.
   */
  private async downscale(file: File, maxDim = 1600, quality = 0.8): Promise<File> {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return file;
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

      return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
    } catch {
      return file;
    }
  }
}
