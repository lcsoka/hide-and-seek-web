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
      const { url } = await this.api.uploadMedia(this.sessionId(), file);
      this.uploaded.emit(url);
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }
}
