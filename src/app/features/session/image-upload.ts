import { Component, inject, input, output, signal } from '@angular/core';
import { ApiClient } from '../../core/services/api-client';

/** A button-styled file picker (camera-capable on mobile) that uploads and emits the public URL. */
@Component({
  selector: 'app-image-upload',
  template: `
    <label [class]="cssClass()" [class.opacity-50]="busy()">
      <input type="file" accept="image/*" capture="environment" class="hidden" [disabled]="busy()" (change)="onPick($event)" />
      {{ busy() ? 'Uploading…' : label() }}
    </label>
  `,
})
export class ImageUpload {
  private readonly api = inject(ApiClient);

  readonly sessionId = input.required<string>();
  readonly label = input('📷 Upload photo');
  readonly cssClass = input('inline-block cursor-pointer rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700');
  readonly uploaded = output<string>();

  readonly busy = signal(false);

  async onPick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.busy.set(true);
    try {
      const image = await this.downscale(file);
      const { url } = await this.api.uploadMedia(this.sessionId(), image);
      this.uploaded.emit(url);
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }

  /**
   * Phone photos are 3–12 MB and trip the server's upload limit. Downscale to a sane
   * max dimension + JPEG quality in the browser first (usually <500 KB). Falls back to
   * the original file if anything goes wrong.
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
