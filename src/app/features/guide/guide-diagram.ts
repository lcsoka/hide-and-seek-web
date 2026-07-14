import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The kind of illustration to draw. */
export type DiagramType = 'candidate' | 'radar' | 'thermometer' | 'matching' | 'tentacles' | 'measuring';

/**
 * A small, self-contained SVG that illustrates one deduction concept, using the same colours as the
 * game map (violet = still-possible area, blue = seeker/radar, amber = thermometer, cyan = a matched
 * place, pink = competing places). Labels use currentColor so they read in light + dark.
 */
@Component({
  selector: 'app-guide-diagram',
  templateUrl: './guide-diagram.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block text-slate-600 dark:text-slate-300' },
})
export class GuideDiagram {
  readonly type = input.required<DiagramType>();
}
