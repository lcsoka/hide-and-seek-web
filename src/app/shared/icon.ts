import { Component, computed, inject, input, ViewEncapsulation } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/** Inner SVG (24×24, stroke = currentColor) for every bespoke line icon in the app. */
const ICONS: Record<string, string> = {
  arrow: '<path d="M15 5l-7 7 7 7"/>',
  ticket: '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7"/><path d="M12 17h.01"/>',
  dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  seek: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  hide: '<path d="M3 12s3.5-6 9-6c1.6 0 3 .5 4.2 1.2M21 12s-3.5 6-9 6c-1.6 0-3-.5-4.2-1.2"/><path d="M4 4l16 16"/><circle cx="12" cy="12" r="2.4"/>',
  ask: '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H6a2 2 0 0 1-2-2z"/><path d="M12 8.5a1.6 1.6 0 1 1 1.8 1.6c-.5.2-.8.5-.8 1"/><path d="M12.9 13h.01"/>',
  train: '<rect x="5" y="4" width="14" height="12" rx="3"/><path d="M5 11h14"/><path d="M8 20l2-3M16 20l-2-3"/><circle cx="9" cy="13.5" r=".6"/><circle cx="15" cy="13.5" r=".6"/>',
  history: '<path d="M4 12a8 8 0 1 1 2.4 5.7"/><path d="M4 12H2m2 0l1 5"/><path d="M12 8v4l3 2"/>',
  locate: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  cards: '<rect x="7" y="4" width="11" height="15" rx="2" transform="rotate(8 12 12)"/><rect x="4" y="6" width="11" height="15" rx="2" transform="rotate(-8 10 13)"/>',
  inbox: '<path d="M4 13l2.5-7h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 13h4l1.5 2h5L16 13h4"/>',
  curse: '<path d="M14 4l-1.5 4L16 7l-2 4 3-1-3 5 1-4-3 1 2-4-3.5 1z"/><path d="M8 13l-3 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z"/>',
  flag: '<path d="M6 21V4M6 4h10l-2 3 2 3H6"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a2 2 0 0 0 2 3M16 6h3a2 2 0 0 1-2 3M10 14h4l-.5 3h-3z"/><path d="M9 20h6"/>',
  video: '<rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 10l6-3v10l-6-3z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  // Question categories.
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-4"/><circle cx="12" cy="12" r="1"/>',
  ruler: '<rect x="3" y="8" width="18" height="8" rx="1.5" transform="rotate(-30 12 12)"/><path d="M8 8.5l1 1.7M11 7l1.4 2.4M14 5.5l1 1.7"/>',
  pin: '<path d="M12 21s6-5 6-10a6 6 0 1 0-12 0c0 5 6 10 6 10z"/><circle cx="12" cy="11" r="2.2"/>',
  thermo: '<path d="M12 4a2 2 0 0 1 2 2v8.5a3.5 3.5 0 1 1-4 0V6a2 2 0 0 1 2-2z"/><circle cx="12" cy="16.5" r="1.6" fill="currentColor" stroke="none"/>',
  camera: '<path d="M4 8a2 2 0 0 1 2-2h1.5l1-2h5l1 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3"/>',
  tentacles: '<circle cx="12" cy="8" r="4"/><path d="M8 11c-1 3-3 4-5 4M10 12c-.5 4-2 6-4 7M14 12c.5 4 2 6 4 7M16 11c1 3 3 4 5 4"/>',
};

/** A single bespoke line icon: `<app-icon name="ask" [size]="20" />`. Colour inherits (currentColor). */
@Component({
  selector: 'app-icon',
  template: '<span class="inline-flex" [innerHTML]="html()"></span>',
  encapsulation: ViewEncapsulation.None,
})
export class Icon {
  private readonly san = inject(DomSanitizer);
  readonly name = input.required<string>();
  readonly size = input(20);

  readonly html = computed<SafeHtml>(() => {
    const s = this.size();

    return this.san.bypassSecurityTrustHtml(
      `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" ` +
        `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block">${ICONS[this.name()] ?? ''}</svg>`,
    );
  });
}
